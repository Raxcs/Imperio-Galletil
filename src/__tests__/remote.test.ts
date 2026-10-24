import { LocalRecord } from '../data/collection';
import { createSupabaseTable } from '../data/remote';

/** Each upsert call is answered by the next scripted response. */
const mockSupabase = {
  responses: [] as ({ error: any } | 'throw')[],
  upserts: [] as any[][],
  selectResult: { data: [] as any[] | null, error: null as any },
};

jest.mock('../lib/supabase', () => ({
  withTimeout: (p: any) => Promise.resolve(p),
  supabase: {
    from: () => ({
      upsert: async (rows: any[]) => {
        mockSupabase.upserts.push(rows);
        const next = mockSupabase.responses.shift() ?? { error: null };
        if (next === 'throw') throw new Error('Tiempo de espera agotado');
        return next;
      },
      select: async () => mockSupabase.selectResult,
    }),
  },
}));

interface Debt {
  id: string;
  name: string;
  note: string;
}

const table = createSupabaseTable<Debt>({
  table: 'debts',
  toRow: (d) => ({ id: d.id, name: d.name, note: d.note }),
  fromRow: (r) => (r.id ? { id: String(r.id), name: r.name, note: r.note } : null),
  legacyDeletedColumns: ['note', 'name'],
});

const rec = (id: string, deleted = false): LocalRecord<Debt> => ({
  data: { id, name: `n${id}`, note: 'x' },
  deleted,
  updatedAt: 1,
  dirty: true,
});

const NETWORK_ERROR = { error: { message: 'TypeError: Network request failed', code: '' } };
const SERVER_REJECT = { error: { message: 'null value in column', code: '23502' } };

beforeEach(() => {
  mockSupabase.responses = [];
  mockSupabase.upserts = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Supabase table push', () => {
  it('sends is_deleted with every row and confirms the whole batch', async () => {
    const ids = await table.push([rec('1'), rec('2', true)]);
    expect(ids).toEqual(['1', '2']);
    expect(mockSupabase.upserts[0]).toEqual([
      { id: '1', name: 'n1', note: 'x', is_deleted: false },
      { id: '2', name: 'n2', note: 'x', is_deleted: true },
    ]);
  });

  it('never mixes rows with different columns in one request (missing columns would become NULL)', async () => {
    const withDate = { ...rec('1'), data: { ...rec('1').data, created_at: '2026-10-01T00:00:00Z' } };
    const withoutDate = rec('2');
    const dated = createSupabaseTable<Debt & { created_at?: string }>({
      table: 'debts',
      toRow: (d) => ({ id: d.id, name: d.name, note: d.note, created_at: d.created_at }),
      fromRow: () => null,
    });

    expect(await dated.push([withDate, withoutDate])).toEqual(['1', '2']);
    expect(mockSupabase.upserts).toHaveLength(2);
    for (const rows of mockSupabase.upserts) {
      const signatures = new Set(rows.map((r) => Object.keys(r).sort().join(',')));
      expect(signatures.size).toBe(1);
    }
    expect(mockSupabase.upserts[1][0]).not.toHaveProperty('created_at');
  });

  it('offline: stops after one attempt instead of retrying row by row', async () => {
    mockSupabase.responses = [NETWORK_ERROR];
    expect(await table.push([rec('1'), rec('2'), rec('3')])).toEqual([]);
    expect(mockSupabase.upserts).toHaveLength(1);
  });

  it('timeout counts as offline too', async () => {
    mockSupabase.responses = ['throw'];
    expect(await table.push([rec('1'), rec('2')])).toEqual([]);
    expect(mockSupabase.upserts).toHaveLength(1);
  });

  it('server rejection: isolates the bad row and confirms the rest', async () => {
    mockSupabase.responses = [SERVER_REJECT, { error: null }, SERVER_REJECT, { error: null }];
    expect(await table.push([rec('1'), rec('2'), rec('3')])).toEqual(['1', '3']);
  });

  it('connection lost during the row by row retry stops early', async () => {
    mockSupabase.responses = [SERVER_REJECT, { error: null }, NETWORK_ERROR];
    expect(await table.push([rec('1'), rec('2'), rec('3')])).toEqual(['1']);
    expect(mockSupabase.upserts).toHaveLength(3);
  });
});

describe('Supabase table pull', () => {
  it('maps is_deleted and legacy prefixes to tombstones with clean text', async () => {
    mockSupabase.selectResult = {
      data: [
        { id: 'a', name: 'Maria', note: 'ok', is_deleted: false },
        { id: 'b', name: 'Carlos', note: 'x', is_deleted: true },
        { id: 'c', name: 'Ana', note: '__DELETED__Paga el lunes', is_deleted: false },
        { id: null, name: 'sin id' },
      ],
      error: null,
    };
    expect(await table.pull()).toEqual([
      { data: { id: 'a', name: 'Maria', note: 'ok' }, deleted: false },
      { data: { id: 'b', name: 'Carlos', note: 'x' }, deleted: true },
      { data: { id: 'c', name: 'Ana', note: 'Paga el lunes' }, deleted: true },
    ]);
  });

  it('returns null when the server cannot be reached', async () => {
    mockSupabase.selectResult = { data: null, error: NETWORK_ERROR.error };
    expect(await table.pull()).toBeNull();
  });
});
