/* eslint-disable @typescript-eslint/no-require-imports -- app restarts are simulated with jest.resetModules() + require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Debt, Ingredient, ProductionLog } from '../types';

/**
 * End to end flows through the real data layer (repositories, collections, migration, sync
 * engine and Supabase adapter) against an in-memory Supabase with an offline switch.
 */
const mockCloud = {
  online: true,
  tables: {} as Record<string, any[]>,
  /** Holds the next selects until released, to interleave user actions with a running sync. */
  selectGate: null as Promise<void> | null,
  upsertCalls: [] as { table: string; rows: any[] }[],
};

jest.mock('../lib/supabase', () => {
  const offline = { data: null, error: { message: 'TypeError: Network request failed', code: '' } };
  return {
    withTimeout: (p: any) => Promise.resolve(p),
    supabase: {
      from: (table: string) => {
        const rows = () => (mockCloud.tables[table] ||= []);
        return {
          select: async () => {
            if (mockCloud.selectGate) await mockCloud.selectGate;
            if (!mockCloud.online) return offline;
            return { data: rows().map((r) => ({ ...r })), error: null };
          },
          upsert: async (payload: any[]) => {
            if (!mockCloud.online) return offline;
            mockCloud.upsertCalls.push({ table, rows: payload });
            for (const row of payload) {
              const existing = rows().find((r) => r.id === row.id);
              if (existing) Object.assign(existing, row);
              else rows().push({ ...row });
            }
            return { error: null };
          },
        };
      },
    },
  };
});

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const debt = (id: string, name: string, extra: Partial<Debt> = {}): Debt => ({
  id,
  name,
  amount: 2000,
  debt_date: '2026-10-20',
  note: '2 packs',
  paid: false,
  paid_date: null,
  created_at: '2026-10-20T10:00:00Z',
  ...extra,
});

const debtRow = (id: string, name: string, extra: object = {}) => ({ ...debt(id, name), is_deleted: false, ...extra });

const batch = (id: string, created_at: string): ProductionLog => ({
  id,
  name: 'Galletas Clasicas',
  qty: 23,
  price_ves: 1200,
  cost_ves: 300,
  created_at,
});

type DataModule = typeof import('../data');
let data: DataModule;

/** Simulates an app launch: fresh module graph over the same persisted storage. */
async function launchApp(): Promise<DataModule> {
  if (data) data.syncEngine.dispose();
  jest.resetModules();
  data = require('../data');
  await data.startData();
  return data;
}

const cloudRow = (table: string, id: string) => mockCloud.tables[table]?.find((r) => r.id === id);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCloud.online = true;
  mockCloud.tables = {};
  mockCloud.selectGate = null;
  mockCloud.upsertCalls = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  data?.syncEngine.dispose();
  jest.restoreAllMocks();
});

describe('Offline first flows', () => {
  it('a debt created while the startup sync waits on the network is never lost', async () => {
    mockCloud.tables.debts = [debtRow(ID_A, 'Maria')];
    let release!: () => void;
    mockCloud.selectGate = new Promise<void>((r) => (release = r));
    mockCloud.online = false;

    const app = await launchApp(); // startup sync is now stuck on the network
    await app.debtsRepo.upsert(debt(ID_B, 'Nueva'));
    mockCloud.selectGate = null;
    release();
    await app.syncNow();

    mockCloud.online = true;
    await app.syncNow();

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot().map((d: Debt) => d.name).sort()).toEqual(['Maria', 'Nueva']);
    expect(cloudRow('debts', ID_B)).toMatchObject({ name: 'Nueva', is_deleted: false });
  });

  it('a delete made offline reaches the cloud and keeps the original note', async () => {
    mockCloud.tables.debts = [debtRow(ID_A, 'Maria', { note: 'Paga el lunes' })];
    const app = await launchApp();
    await app.syncNow();

    mockCloud.online = false;
    await app.debtsRepo.remove(ID_A);
    await app.syncNow();
    expect(cloudRow('debts', ID_A).is_deleted).toBe(false);

    mockCloud.online = true;
    await app.syncNow();
    expect(cloudRow('debts', ID_A)).toMatchObject({ is_deleted: true, note: 'Paga el lunes', name: 'Maria' });
  });

  it('a reinstall restores from the cloud and deleted records stay deleted', async () => {
    let app = await launchApp();
    await app.debtsRepo.upsert(debt(ID_A, 'Maria'));
    await app.debtsRepo.upsert(debt(ID_B, 'Carlos'));
    await app.debtsRepo.remove(ID_B);
    await app.syncNow();

    await AsyncStorage.clear(); // reinstall: the device storage is gone
    app = await launchApp();
    await app.syncNow();

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot().map((d: Debt) => d.id)).toEqual([ID_A]);
  });

  it('two deletes in a row both persist, offline, across a restart', async () => {
    mockCloud.tables.debts = [debtRow(ID_A, 'Maria'), debtRow(ID_B, 'Carlos')];
    let app = await launchApp();
    await app.syncNow();

    mockCloud.online = false;
    await Promise.all([app.debtsRepo.remove(ID_A), app.debtsRepo.remove(ID_B)]);
    app = await launchApp(); // app closed before any upload
    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot()).toHaveLength(0);

    mockCloud.online = true;
    await app.syncNow();
    expect(mockCloud.tables.debts.every((r) => r.is_deleted)).toBe(true);
  });

  it('undo right after delete leaves the record active everywhere', async () => {
    const app = await launchApp();
    await app.logsRepo.upsert(batch(ID_A, '2026-10-20T10:00:00Z'));
    await app.syncNow();

    const pendingDelete = app.logsRepo.remove(ID_A); // not awaited, like the screen
    await app.logsRepo.restore(ID_A);
    await pendingDelete;
    await app.syncNow();

    const { logsCollection } = require('../data/tables');
    expect(logsCollection.getSnapshot().map((l: ProductionLog) => l.id)).toEqual([ID_A]);
    expect(cloudRow('production_logs', ID_A).is_deleted).toBe(false);
  });

  it('identical production batches on different days are never touched by sync', async () => {
    mockCloud.tables.production_logs = [
      { ...batch(ID_A, '2026-10-20T10:00:00Z'), is_deleted: false },
      { ...batch(ID_B, '2026-10-13T10:00:00Z'), is_deleted: false },
    ];
    const app = await launchApp();
    await app.syncNow();
    await app.syncNow();

    const { logsCollection } = require('../data/tables');
    expect(logsCollection.getSnapshot().map((l: ProductionLog) => l.id)).toEqual([ID_A, ID_B]);
    expect(mockCloud.upsertCalls).toHaveLength(0);
  });

  it('each app open adds records that exist only in the cloud, without reviving deletes', async () => {
    let app = await launchApp();
    await app.debtsRepo.upsert(debt(ID_A, 'Maria'));
    await app.debtsRepo.remove(ID_A);
    await app.syncNow();

    // Something appears in the cloud that this device does not have
    mockCloud.tables.debts.push(debtRow(ID_B, 'Solo en la nube'));
    cloudRow('debts', ID_A).is_deleted = false; // and the cloud copy of a local delete is active

    app = await launchApp();
    await app.syncNow();

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot().map((d: Debt) => d.id)).toEqual([ID_B]);
  });

  it('coming back to the app uploads pending changes', async () => {
    jest.useFakeTimers();
    try {
      const app = await launchApp();
      mockCloud.online = false;
      await app.debtsRepo.upsert(debt(ID_A, 'Maria'));
      await jest.advanceTimersByTimeAsync(2500); // debounced sync fails offline

      mockCloud.online = true;
      require('react-native').AppState.__emit('active');
      await jest.advanceTimersByTimeAsync(10);

      expect(cloudRow('debts', ID_A)).toMatchObject({ name: 'Maria' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('ingredient selection is device only and never uploaded', async () => {
    const ingredient: Ingredient = {
      id: ID_A,
      name: 'Harina',
      presentation: '1 kg',
      category: ['galletas'],
      price_usd: 1,
      price_ves: 900,
    };
    const app = await launchApp();
    await app.ingredientsRepo.upsert(ingredient);
    await app.syncNow();
    mockCloud.upsertCalls = [];

    await app.ingredientsRepo.toggleSelected(ID_A);
    await app.syncNow();

    const { ingredientsCollection } = require('../data/tables');
    expect(ingredientsCollection.get(ID_A).selected).toBe(true);
    expect(mockCloud.upsertCalls).toHaveLength(0);
    expect(cloudRow('ingredients', ID_A)).not.toHaveProperty('selected');
  });

  it('paid debts older than the purge window leave the list at startup and are deleted in the cloud', async () => {
    const old = new Date(Date.now() - 40 * 86400000).toISOString().split('T')[0];
    mockCloud.tables.debts = [
      debtRow(ID_A, 'Vieja', { paid: true, paid_date: old }),
      debtRow(ID_B, 'Pendiente', { debt_date: old }),
    ];
    let app = await launchApp(); // bootstrap brings both
    await app.syncNow();
    app = await launchApp(); // next open purges
    await app.syncNow();

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot().map((d: Debt) => d.id)).toEqual([ID_B]);
    expect(cloudRow('debts', ID_A).is_deleted).toBe(true);
  });
});

describe('Upgrade from the previous app version', () => {
  it('migrates the old cache, uploads pending work and buries deletes that never reached the cloud', async () => {
    mockCloud.tables.debts = [debtRow(ID_A, 'Maria'), debtRow(ID_B, 'Borrada offline')];
    await AsyncStorage.setItem('@imperio_galletil_debts', JSON.stringify([debt(ID_A, 'Maria F')]));
    await AsyncStorage.setItem('@imperio_galletil_pending_debts', JSON.stringify([ID_A]));
    await AsyncStorage.setItem('@imperio_galletil_deleted_debts', JSON.stringify([ID_B]));

    const app = await launchApp();
    await app.syncNow();
    await app.syncNow(); // the tombstone found during the bootstrap is uploaded

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot().map((d: Debt) => d.name)).toEqual(['Maria F']);
    expect(cloudRow('debts', ID_A)).toMatchObject({ name: 'Maria F', is_deleted: false });
    expect(cloudRow('debts', ID_B)).toMatchObject({ name: 'Borrada offline', is_deleted: true });
  });

  it('reads rows still marked with the old text prefix as deleted', async () => {
    mockCloud.tables.debts = [debtRow(ID_A, 'Maria', { note: '__DELETED__2 packs' })];
    const app = await launchApp();
    await app.syncNow();
    await flush();

    const { debtsCollection } = require('../data/tables');
    expect(debtsCollection.getSnapshot()).toHaveLength(0);
  });
});
