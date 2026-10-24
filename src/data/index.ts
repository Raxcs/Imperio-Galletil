import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { purgeOldDebts } from '../services/debtsService';
import { Collection } from './collection';
import { migrateAllLegacy } from './migrateLegacy';
import { createSyncEngine, SyncReport } from './syncEngine';
import {
  debtsCollection,
  debtsRemote,
  ingredientsCollection,
  ingredientsRemote,
  logsCollection,
  logsRemote,
  recipesCollection,
  recipesRemote,
} from './tables';

/**
 * Single entry point of the data layer. Screens read through the hooks and write through the
 * repositories; nothing else touches storage or Supabase.
 */

export const syncEngine = createSyncEngine([
  { collection: debtsCollection, remote: debtsRemote },
  { collection: logsCollection, remote: logsRemote },
  { collection: ingredientsCollection, remote: ingredientsRemote },
  { collection: recipesCollection, remote: recipesRemote },
]);

const allCollections: Collection<any>[] = [debtsCollection, logsCollection, ingredientsCollection, recipesCollection];

export interface Repository<T> {
  upsert(item: T): Promise<T>;
  /** Tombstone; reversible with `restore`. */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** Every local write schedules an upload; the write itself never waits for the network. */
function createRepository<T extends { id: string }>(collection: Collection<T>): Repository<T> {
  const thenSync = <R>(p: Promise<R>) =>
    p.then((result) => {
      syncEngine.requestSync();
      return result;
    });
  return {
    upsert: (item) => thenSync(collection.upsert(item)),
    remove: (id) => thenSync(collection.remove(id)),
    restore: (id) => thenSync(collection.restore(id)),
  };
}

export const debtsRepo = createRepository(debtsCollection);
export const logsRepo = createRepository(logsCollection);
export const recipesRepo = createRepository(recipesCollection);
export const ingredientsRepo = {
  ...createRepository(ingredientsCollection),
  /** Selection is device only UI state: never uploaded. */
  toggleSelected: (id: string) => {
    const item = ingredientsCollection.get(id);
    if (!item) return Promise.resolve();
    return ingredientsCollection.patchLocal([{ id, patch: { selected: !item.selected } }]);
  },
  clearSelected: () =>
    ingredientsCollection.patchLocal(
      ingredientsCollection
        .getSnapshot()
        .filter((i) => i.selected)
        .map((i) => ({ id: i.id, patch: { selected: false } }))
    ),
};

function useCollection<T extends { id: string }>(collection: Collection<T>): T[] {
  return useSyncExternalStore(collection.subscribe, collection.getSnapshot, collection.getSnapshot);
}

export const useDebts = () => useCollection(debtsCollection);
export const useLogs = () => useCollection(logsCollection);
export const useIngredients = () => useCollection(ingredientsCollection);
export const useRecipes = () => useCollection(recipesCollection);

/** Paid debts older than the purge window leave the active list (tombstone, still in the cloud). */
async function purgeExpiredDebts() {
  const { expiredIds } = purgeOldDebts(debtsCollection.getSnapshot());
  for (const id of expiredIds) await debtsCollection.remove(id);
}

let started: Promise<void> | null = null;

/**
 * App start: migrate legacy storage once, load everything from disk, then sync in the
 * background. Resolves as soon as local data is ready; never waits for the network.
 */
export function startData(): Promise<void> {
  if (!started) {
    started = (async () => {
      await migrateAllLegacy();
      await Promise.all(allCollections.map((c) => c.load()));
      await purgeExpiredDebts().catch((err) => console.warn('Error purging old debts', err));

      // Once per app open: pick up anything that exists in the cloud but not on the device
      syncEngine.requestPullMissing();
      syncEngine.syncAll().catch(() => {});

      AppState.addEventListener('change', (state) => {
        if (state === 'active') syncEngine.requestSync(0);
      });
    })();
  }
  return started;
}

/** Manual sync (pull to refresh). Local data is already current; this only uploads. */
export function syncNow(): Promise<SyncReport> {
  return syncEngine.syncAll();
}
