import { createIdSetStore, generateId, isUuid, mergeWithRemote, singleFlight } from '../lib/sync';
import { debtContentKey } from '../services/debtsService';
import { productionLogContentKey } from '../services/productionService';
import { Debt, ProductionLog } from '../types';

const vicky = (id: string, note = 'Galletas del viernes'): Debt => ({
  id,
  name: 'Vicky',
  amount: 2000,
  debt_date: '2026-10-10',
  note,
  paid: false,
  paid_date: null,
});

describe('Sync helpers', () => {
  it('generates valid UUIDs', () => {
    const id = generateId();
    expect(isUuid(id)).toBe(true);
    expect(isUuid('temp_123')).toBe(false);
    expect(isUuid('1')).toBe(false);
  });

  it('collapses legacy temp_ copies when the server already has the same debt', () => {
    const remoteId = generateId();
    const remote = [vicky(remoteId)];
    const local = [vicky('temp_1'), vicky('temp_1'), vicky(remoteId)];

    const { merged, toUpsert } = mergeWithRemote({
      remote,
      remoteAll: remote,
      local,
      pendingIds: new Set(),
      contentKey: debtContentKey,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(remoteId);
    expect(toUpsert).toHaveLength(0);
  });

  it('migrates a legacy local debt missing remotely exactly once with a new UUID', () => {
    const local = [vicky('temp_1'), vicky('temp_2')];

    const { merged, toUpsert } = mergeWithRemote({
      remote: [],
      remoteAll: [],
      local,
      pendingIds: new Set(),
      contentKey: debtContentKey,
    });

    expect(merged).toHaveLength(1);
    expect(toUpsert).toHaveLength(1);
    expect(isUuid(toUpsert[0].id)).toBe(true);
  });

  it('does not resurrect a legacy debt that was soft deleted on the server', () => {
    const deletedRemote = vicky(generateId(), '__DELETED__Galletas del viernes');

    const { merged, toUpsert } = mergeWithRemote({
      remote: [],
      remoteAll: [deletedRemote],
      local: [vicky('temp_1')],
      pendingIds: new Set(),
      contentKey: debtContentKey,
    });

    expect(merged).toHaveLength(0);
    expect(toUpsert).toHaveLength(0);
  });

  it('keeps and re-upserts pending local records, drops non pending ones missing remotely', () => {
    const pendingId = generateId();
    const removedElsewhereId = generateId();

    const { merged, toUpsert } = mergeWithRemote({
      remote: [],
      remoteAll: [],
      local: [vicky(pendingId), { ...vicky(removedElsewhereId), name: 'Carlos' }],
      pendingIds: new Set([pendingId]),
      contentKey: debtContentKey,
    });

    expect(merged.map((d) => d.id)).toEqual([pendingId]);
    expect(toUpsert.map((d) => d.id)).toEqual([pendingId]);
  });

  it('prefers the local copy only while it has pending changes', () => {
    const id = generateId();
    const remote = [{ ...vicky(id), amount: 2000 }];
    const local = [{ ...vicky(id), amount: 3500 }];

    const notPending = mergeWithRemote({
      remote, remoteAll: remote, local, pendingIds: new Set(), contentKey: debtContentKey,
    });
    expect(notPending.merged[0].amount).toBe(2000);
    expect(notPending.toUpsert).toHaveLength(0);

    const pending = mergeWithRemote({
      remote, remoteAll: remote, local, pendingIds: new Set([id]), contentKey: debtContentKey,
    });
    expect(pending.merged[0].amount).toBe(3500);
    expect(pending.toUpsert).toHaveLength(1);
  });

  it('discards legacy seed production logs instead of uploading them', () => {
    const seed: ProductionLog = { id: '1', name: 'Galletas Clasicas', qty: 40, price_ves: 1000, cost_ves: 286.93 };

    const { merged, toUpsert } = mergeWithRemote({
      remote: [],
      remoteAll: [],
      local: [seed],
      pendingIds: new Set(),
      contentKey: productionLogContentKey,
      discardLegacy: (l) => l.id === '1' || l.id === '2',
    });

    expect(merged).toHaveLength(0);
    expect(toUpsert).toHaveLength(0);
  });

  it('shares a single in-flight sync between concurrent callers', async () => {
    let calls = 0;
    const run = singleFlight(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });

    const [a, b] = await Promise.all([run(), run()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);

    await run();
    expect(calls).toBe(2);
  });

  it('does not lose ids on concurrent id set writes', async () => {
    const store = createIdSetStore('@test_pending_ids');
    await Promise.all([store.add('a'), store.add('b'), store.addMany(['c', 'd']), store.remove('a')]);
    const ids = await store.getAll();
    expect([...ids].sort()).toEqual(['b', 'c', 'd']);
  });

  it('collapses duplicate remote records when dedupeRemote is provided', () => {
    const id1 = generateId();
    const id2 = generateId();
    const remote = [vicky(id1), vicky(id2)];

    const { merged } = mergeWithRemote({
      remote,
      remoteAll: remote,
      local: [],
      pendingIds: new Set(),
      contentKey: debtContentKey,
      dedupeRemote: (items) => [items[0]],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(id1);
  });
});
