import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One locally owned record. The device is the source of truth: `data`, the tombstone and the
 * "not uploaded yet" flag live in the same object and are persisted in the same write, so a
 * pending change can never exist without its data.
 */
export interface LocalRecord<T> {
  data: T;
  deleted: boolean;
  /** Local monotonic clock, used to clear `dirty` only if nothing changed during an upload. */
  updatedAt: number;
  dirty: boolean;
}

export interface RemoteRecord<T> {
  data: T;
  deleted: boolean;
}

interface PersistedState<T> {
  version: 2;
  /** True once a full pull from the cloud has been merged (see `mergeMissing`). */
  bootstrapped: boolean;
  records: Record<string, LocalRecord<T>>;
  /**
   * Ids deleted locally whose data we do not have (legacy caches dropped deleted rows).
   * When the row arrives from the cloud it is stored as a tombstone and its delete is uploaded.
   */
  orphanTombstones?: string[];
}

export interface Collection<T extends { id: string }> {
  readonly name: string;
  load(): Promise<void>;
  isLoaded(): boolean;
  /** Active (non deleted) records, sorted. Same reference until the next change. */
  getSnapshot(): T[];
  subscribe(listener: () => void): () => void;
  get(id: string): T | undefined;
  /** Creates or replaces a record and marks it for upload. */
  upsert(item: T): Promise<T>;
  /** Tombstones a record and marks it for upload. Never removes it physically. */
  remove(id: string): Promise<void>;
  /** Clears the tombstone (undo) and marks it for upload. */
  restore(id: string): Promise<void>;
  /** Device only fields (e.g. UI selection): updates data without marking it for upload. */
  patchLocal(changes: { id: string; patch: Partial<T> }[]): Promise<void>;

  // Sync API
  getDirty(): LocalRecord<T>[];
  /** Clears `dirty` only if the record was not modified after `updatedAt` (compare and clear). */
  markClean(ids: { id: string; updatedAt: number }[]): Promise<void>;
  /** Adds remote records whose ids do not exist locally. Never overwrites or deletes local data. */
  mergeMissing(remote: RemoteRecord<T>[]): Promise<number>;
  isBootstrapped(): boolean;
  setBootstrapped(): Promise<void>;
  /** Replaces the whole state, only used by the one time legacy migration. */
  importState(records: Record<string, LocalRecord<T>>, orphanTombstones?: string[]): Promise<void>;
}

export interface CollectionOptions<T> {
  name: string;
  storageKey: string;
  sort?: (a: T, b: T) => number;
}

export function createCollection<T extends { id: string; created_at?: string }>(
  options: CollectionOptions<T>
): Collection<T> {
  let state: PersistedState<T> = { version: 2, bootstrapped: false, records: {} };
  let loaded = false;
  let loading: Promise<void> | null = null;
  let snapshot: T[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  let clock = 0;
  const listeners = new Set<() => void>();

  const tick = () => {
    clock = Math.max(Date.now(), clock + 1);
    return clock;
  };

  const rebuildSnapshot = () => {
    const active = Object.values(state.records)
      .filter((r) => !r.deleted)
      .map((r) => r.data);
    snapshot = options.sort ? active.sort(options.sort) : active;
  };

  const notify = () => listeners.forEach((l) => l());

  const load = (): Promise<void> => {
    if (loaded) return Promise.resolve();
    if (!loading) {
      loading = (async () => {
        try {
          const raw = await AsyncStorage.getItem(options.storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === 2 && parsed.records) state = parsed;
          }
        } catch (err) {
          console.warn(`Error loading collection ${options.name}`, err);
        }
        for (const r of Object.values(state.records)) clock = Math.max(clock, r.updatedAt);
        rebuildSnapshot();
        loaded = true;
        notify();
      })();
    }
    return loading;
  };

  /**
   * Serialized read modify write. The next state is persisted before it becomes visible, so a
   * failed write leaves memory and disk consistent and the caller gets the error.
   */
  const mutate = <R>(fn: (draft: PersistedState<T>) => R): Promise<R> => {
    const run = queue.then(async () => {
      await load();
      const draft: PersistedState<T> = { ...state, records: { ...state.records } };
      const result = fn(draft);
      await AsyncStorage.setItem(options.storageKey, JSON.stringify(draft));
      state = draft;
      rebuildSnapshot();
      notify();
      return result;
    });
    queue = run.catch(() => {});
    return run;
  };

  return {
    name: options.name,
    load,
    isLoaded: () => loaded,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (id) => {
      const r = state.records[id];
      return r && !r.deleted ? r.data : undefined;
    },

    upsert: (item) =>
      mutate((draft) => {
        const prev = draft.records[item.id];
        const data = { ...item, created_at: item.created_at ?? prev?.data.created_at ?? new Date().toISOString() };
        draft.records[item.id] = { data, deleted: false, updatedAt: tick(), dirty: true };
        return data;
      }),

    remove: (id) =>
      mutate((draft) => {
        const prev = draft.records[id];
        if (!prev || prev.deleted) return;
        draft.records[id] = { ...prev, deleted: true, updatedAt: tick(), dirty: true };
      }),

    restore: (id) =>
      mutate((draft) => {
        const prev = draft.records[id];
        if (!prev || !prev.deleted) return;
        draft.records[id] = { ...prev, deleted: false, updatedAt: tick(), dirty: true };
      }),

    patchLocal: (changes) =>
      mutate((draft) => {
        for (const { id, patch } of changes) {
          const prev = draft.records[id];
          if (prev) draft.records[id] = { ...prev, data: { ...prev.data, ...patch, id } };
        }
      }),

    getDirty: () => Object.values(state.records).filter((r) => r.dirty),

    markClean: (ids) =>
      mutate((draft) => {
        for (const { id, updatedAt } of ids) {
          const r = draft.records[id];
          if (r && r.dirty && r.updatedAt === updatedAt) draft.records[id] = { ...r, dirty: false };
        }
      }),

    mergeMissing: (remote) =>
      mutate((draft) => {
        let added = 0;
        const orphans = new Set(draft.orphanTombstones ?? []);
        for (const item of remote) {
          const id = item.data.id;
          if (draft.records[id]) continue;
          if (orphans.has(id)) {
            // Deleted on this device before the cloud knew: keep it deleted and upload the delete
            draft.records[id] = { data: item.data, deleted: true, updatedAt: tick(), dirty: !item.deleted };
            orphans.delete(id);
            continue;
          }
          draft.records[id] = { data: item.data, deleted: item.deleted, updatedAt: tick(), dirty: false };
          if (!item.deleted) added++;
        }
        draft.orphanTombstones = [...orphans];
        return added;
      }),

    isBootstrapped: () => state.bootstrapped,
    setBootstrapped: () =>
      mutate((draft) => {
        draft.bootstrapped = true;
      }),

    importState: (records, orphanTombstones = []) =>
      mutate((draft) => {
        draft.records = { ...records };
        draft.orphanTombstones = orphanTombstones.filter((id) => !records[id]);
        for (const r of Object.values(records)) clock = Math.max(clock, r.updatedAt);
      }),
  };
}
