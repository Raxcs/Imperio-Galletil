/* eslint-disable @typescript-eslint/no-require-imports -- app restarts are simulated with jest.resetModules() + require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isUuid } from '../lib/sync';

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_GONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const debt = (id: string, extra: object = {}) => ({
  id,
  name: 'Maria',
  amount: 2000,
  debt_date: '2026-10-20',
  note: '2 packs',
  paid: false,
  paid_date: null,
  created_at: '2026-10-20T10:00:00Z',
  ...extra,
});

/** Fresh module graph per test: collections are module level singletons. */
function load() {
  jest.resetModules();
  return {
    migrate: require('../data/migrateLegacy') as typeof import('../data/migrateLegacy'),
    tables: require('../data/tables') as typeof import('../data/tables'),
  };
}

const put = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Legacy migration', () => {
  it('imports debts keeping pending state, tombstones and legacy ids', async () => {
    await put('@imperio_galletil_debts', [
      debt(UUID_A), // synced
      debt(UUID_B, { name: 'Carlos' }), // edited offline
      debt('temp_1', { name: 'Ana' }), // never synced, legacy id
      debt(UUID_C, { name: 'Pedro', note: '__DELETED__Pagado' }), // legacy prefix
    ]);
    await put('@imperio_galletil_pending_debts', [UUID_B]);
    await put('@imperio_galletil_deleted_debts', [UUID_GONE]);

    const { migrate, tables } = load();
    expect(await migrate.migrateLegacyCollection(migrate.debtsLegacySource)).toBe('migrated');
    const c = tables.debtsCollection;

    expect(c.getSnapshot().map((d) => d.name).sort()).toEqual(['Ana', 'Carlos', 'Maria']);
    const dirty = c.getDirty();
    expect(dirty.map((r) => r.data.name).sort()).toEqual(['Ana', 'Carlos', 'Pedro']);
    const ana = dirty.find((r) => r.data.name === 'Ana')!;
    expect(isUuid(ana.data.id)).toBe(true);
    const pedro = dirty.find((r) => r.data.name === 'Pedro')!;
    expect(pedro).toMatchObject({ deleted: true, data: { note: 'Pagado' } });
  });

  it('a delete that never reached the server does not come back from the cloud', async () => {
    await put('@imperio_galletil_debts', [debt(UUID_A)]);
    await put('@imperio_galletil_deleted_debts', [UUID_GONE]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.debtsLegacySource);
    const c = tables.debtsCollection;

    // The cloud still has it active because the old delete failed offline
    await c.mergeMissing([{ data: debt(UUID_GONE, { name: 'Borrada' }), deleted: false }]);

    expect(c.getSnapshot().map((d) => d.id)).toEqual([UUID_A]);
    expect(c.getDirty()).toEqual([expect.objectContaining({ deleted: true, data: expect.objectContaining({ id: UUID_GONE }) })]);
  });

  it('discards the old sample production logs and keeps real ones', async () => {
    await put('@imperio_galletil_production_logs', [
      { id: '1', name: 'Galletas Clasicas', qty: 40, price_ves: 1000, cost_ves: 286.93 },
      { id: UUID_A, name: 'Galletas Clasicas', qty: 40, price_ves: 1000, cost_ves: 286.93 },
      { id: UUID_B, name: 'Galletas Clasicas', qty: 30, price_ves: 1000, cost_ves: 280.22 },
    ]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.logsLegacySource);
    expect(tables.logsCollection.getSnapshot().map((l) => l.id)).toEqual([UUID_B]);
  });

  it('ingredients: drops old seed ids and cleans archived markers', async () => {
    await put('@imperio_galletil_ingredients', [
      { id: '1', name: 'Harina', presentation: '1 kg', category: ['galletas'], price_usd: 1, price_ves: 900 },
      {
        id: UUID_A,
        name: 'Cacao',
        presentation: '__DELETED__200g',
        category: ['brownies', 'archived'],
        price_usd: 5,
        price_ves: 4000,
      },
      { id: UUID_B, name: 'Azucar', presentation: '1 kg', category: ['galletas'], price_usd: 1, price_ves: 900, selected: true },
    ]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.ingredientsLegacySource);
    const c = tables.ingredientsCollection;

    expect(c.getSnapshot()).toEqual([expect.objectContaining({ id: UUID_B, selected: true })]);
    expect(c.getDirty()).toEqual([
      expect.objectContaining({ deleted: true, data: expect.objectContaining({ presentation: '200g', category: ['brownies'] }) }),
    ]);
  });

  it('recipes keep their text ids', async () => {
    await put('@imperio_galletil_recipes', [
      { id: 'cookies', title: 'Galletas', subtitle: '', batch_yield: 23, batch_cost_usd: 7, pack_cost_usd: 0.3, process: '', ingredients: [] },
    ]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.recipesLegacySource);
    expect(tables.recipesCollection.getSnapshot().map((r) => r.id)).toEqual(['cookies']);
    expect(tables.recipesCollection.getDirty()).toHaveLength(0);
  });

  it('runs once: later changes are never overwritten by a second run', async () => {
    await put('@imperio_galletil_debts', [debt(UUID_A)]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.debtsLegacySource);
    await tables.debtsCollection.remove(UUID_A);

    expect(await migrate.migrateLegacyCollection(migrate.debtsLegacySource)).toBe('skipped');
    expect(tables.debtsCollection.getSnapshot()).toHaveLength(0);
  });

  it('survives a restart after migrating and never touches the legacy keys', async () => {
    const legacy = [debt(UUID_A)];
    await put('@imperio_galletil_debts', legacy);
    let mod = load();
    await mod.migrate.migrateLegacyCollection(mod.migrate.debtsLegacySource);
    await mod.tables.debtsCollection.upsert(debt(UUID_B, { name: 'Nueva' }));

    mod = load(); // app restart
    expect(await mod.migrate.migrateLegacyCollection(mod.migrate.debtsLegacySource)).toBe('skipped');
    expect(mod.tables.debtsCollection.getSnapshot().map((d) => d.name).sort()).toEqual(['Maria', 'Nueva']);
    expect(JSON.parse((await AsyncStorage.getItem('@imperio_galletil_debts'))!)).toEqual(legacy);
  });

  it('fresh install with no legacy data migrates nothing and waits for the cloud', async () => {
    const { migrate, tables } = load();
    expect(await migrate.migrateLegacyCollection(migrate.debtsLegacySource)).toBe('migrated');
    expect(tables.debtsCollection.getSnapshot()).toHaveLength(0);
    expect(tables.debtsCollection.isBootstrapped()).toBe(false);
  });

  it('corrupted legacy cache does not crash and still imports the tombstones', async () => {
    await AsyncStorage.setItem('@imperio_galletil_debts', '{not json');
    await put('@imperio_galletil_deleted_debts', [UUID_GONE]);
    const { migrate, tables } = load();
    await migrate.migrateLegacyCollection(migrate.debtsLegacySource);
    await tables.debtsCollection.mergeMissing([{ data: debt(UUID_GONE), deleted: false }]);
    expect(tables.debtsCollection.getSnapshot()).toHaveLength(0);
  });
});
