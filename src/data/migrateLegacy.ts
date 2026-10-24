import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId, isUuid, stripDeletedPrefix, DELETED_PREFIX } from '../lib/sync';
import { Debt, Ingredient, ProductionLog, Recipe } from '../types';
import { Collection, LocalRecord } from './collection';
import { debtsCollection, ingredientsCollection, logsCollection, recipesCollection } from './tables';

/**
 * One time import of the pre v2 storage (array caches + id sets) into the new collections.
 * Legacy keys are never modified or removed, so they stay as a backup on the device.
 */
export interface LegacySource<T extends { id: string }> {
  collection: Collection<T>;
  cacheKey: string;
  deletedKey: string;
  /** Pending upsert ids and pending delete ids. */
  pendingKeys: string[];
  isLegacyDeleted(item: T): boolean;
  /** Removes legacy delete markers from the data. */
  clean(item: T): T;
  /** Records that must not be migrated (old sample seed data). */
  discard?(item: T): boolean;
  /** Non UUID ids that are valid on the server and must be kept. */
  keepId?(id: string): boolean;
}

const MIGRATED_PREFIX = '@imperio_galletil_v2_migrated_';

async function readJsonArray(key: string): Promise<unknown[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.warn(`Error reading legacy key ${key}`, err);
    return null;
  }
}

export async function migrateLegacyCollection<T extends { id: string }>(
  source: LegacySource<T>
): Promise<'migrated' | 'skipped'> {
  const { collection } = source;
  const markerKey = MIGRATED_PREFIX + collection.name;
  await collection.load();

  const alreadyMigrated = await AsyncStorage.getItem(markerKey);
  const hasV2Data = collection.getSnapshot().length > 0 || collection.getDirty().length > 0;
  if (alreadyMigrated || hasV2Data) return 'skipped';

  const cache = (await readJsonArray(source.cacheKey)) as T[] | null;
  const deletedIds = new Set(((await readJsonArray(source.deletedKey)) ?? []).map(String));
  const pendingIds = new Set<string>();
  for (const key of source.pendingKeys) {
    for (const id of (await readJsonArray(key)) ?? []) pendingIds.add(String(id));
  }

  const records: Record<string, LocalRecord<T>> = {};
  const now = Date.now();
  for (const raw of cache ?? []) {
    if (!raw || raw.id === undefined || raw.id === null) continue;
    const item = { ...raw, id: String(raw.id) };
    if (source.discard?.(item)) continue;

    const keepsId = isUuid(item.id) || !!source.keepId?.(item.id);
    const id = keepsId ? item.id : generateId();
    const deleted = deletedIds.has(item.id) || source.isLegacyDeleted(item);
    records[id] = {
      data: { ...source.clean(item), id },
      deleted,
      updatedAt: now,
      // Re-sending a delete is idempotent; untouched records already match the server
      dirty: deleted || !keepsId || pendingIds.has(item.id),
    };
  }

  // Old caches dropped deleted rows: keep their ids so the cloud copy arrives as a tombstone
  const orphanTombstones = [...deletedIds].filter((id) => !records[id]);

  await collection.importState(records, orphanTombstones);
  await AsyncStorage.setItem(markerKey, new Date().toISOString());
  return 'migrated';
}

// ----- Entity specific sources -----

const startsDeleted = (value: unknown) => typeof value === 'string' && value.startsWith(DELETED_PREFIX);
const LEGACY_DELETED_CATEGORIES = ['archived', 'deleted'];

/** Old hardcoded sample logs (ids '1', '2' or their exact content). Never real sales. */
export function isLegacySeedLog(log: ProductionLog): boolean {
  if (log.id === '1' || log.id === '2') return true;
  const name = stripDeletedPrefix(log.name).trim().toLowerCase();
  return (
    (name === 'galletas clasicas' && Number(log.qty) === 40 && Number(log.price_ves) === 1000 &&
      Math.abs(Number(log.cost_ves) - 286.93) < 0.5) ||
    (name === 'brownie con galleta' && Number(log.qty) === 8 && Number(log.price_ves) === 2500 &&
      Math.abs(Number(log.cost_ves) - 997.04) < 0.5)
  );
}

/** Ids of the old hardcoded ingredient seeds; the server has its own copies of them. */
const LEGACY_SEED_INGREDIENT_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);

export const debtsLegacySource: LegacySource<Debt> = {
  collection: debtsCollection,
  cacheKey: '@imperio_galletil_debts',
  deletedKey: '@imperio_galletil_deleted_debts',
  pendingKeys: ['@imperio_galletil_pending_debts', '@imperio_galletil_pending_deleted_debts'],
  isLegacyDeleted: (d) => !!(d.deleted || d.is_deleted) || startsDeleted(d.note) || startsDeleted(d.name),
  clean: ({ deleted, is_deleted, ...d }) => ({
    ...d,
    name: stripDeletedPrefix(d.name),
    note: stripDeletedPrefix(d.note),
  }),
};

export const logsLegacySource: LegacySource<ProductionLog> = {
  collection: logsCollection,
  cacheKey: '@imperio_galletil_production_logs',
  deletedKey: '@imperio_galletil_deleted_production_logs',
  pendingKeys: ['@imperio_galletil_pending_production_logs', '@imperio_galletil_pending_deleted_production_logs'],
  isLegacyDeleted: (l) => !!(l.deleted || l.is_deleted) || startsDeleted(l.name),
  clean: ({ deleted, is_deleted, ...l }) => ({ ...l, name: stripDeletedPrefix(l.name) }),
  discard: isLegacySeedLog,
};

export const ingredientsLegacySource: LegacySource<Ingredient> = {
  collection: ingredientsCollection,
  cacheKey: '@imperio_galletil_ingredients',
  deletedKey: '@imperio_galletil_deleted_ingredients',
  pendingKeys: ['@imperio_galletil_pending_ingredients', '@imperio_galletil_pending_deleted_ingredients'],
  isLegacyDeleted: (i) =>
    !!(i.deleted || i.is_deleted) ||
    startsDeleted(i.presentation) ||
    (Array.isArray(i.category) && i.category.some((c) => LEGACY_DELETED_CATEGORIES.includes(c))),
  clean: ({ deleted, is_deleted, ...i }) => ({
    ...i,
    presentation: stripDeletedPrefix(i.presentation),
    category: (Array.isArray(i.category) ? i.category : []).filter((c) => !LEGACY_DELETED_CATEGORIES.includes(c)),
  }),
  discard: (i) => LEGACY_SEED_INGREDIENT_IDS.has(i.id),
};

export const recipesLegacySource: LegacySource<Recipe> = {
  collection: recipesCollection,
  cacheKey: '@imperio_galletil_recipes',
  deletedKey: '@imperio_galletil_deleted_recipes',
  pendingKeys: ['@imperio_galletil_pending_recipes', '@imperio_galletil_pending_deleted_recipes'],
  isLegacyDeleted: (r) => !!(r.deleted || r.is_deleted) || startsDeleted(r.subtitle),
  clean: ({ deleted, is_deleted, ...r }) => ({ ...r, subtitle: stripDeletedPrefix(r.subtitle) }),
  // Seeded recipes keep their text ids on the server ('cookies', 'brownies')
  keepId: () => true,
};

export async function migrateAllLegacy(): Promise<void> {
  const sources = [debtsLegacySource, logsLegacySource, ingredientsLegacySource, recipesLegacySource] as LegacySource<
    any
  >[];
  // Each collection migrates on its own: one failure must not block the others
  await Promise.allSettled(sources.map(migrateLegacyCollection));
}
