import { Collection } from './collection';
import { RemoteTable } from './remote';

export interface SyncEntry<T extends { id: string }> {
  collection: Collection<T>;
  remote: RemoteTable<T>;
}

export interface SyncReport {
  pushed: number;
  /** Records still waiting for upload after this run. */
  pending: number;
  /** Records added locally from the cloud (bootstrap or missing record check). */
  restored: number;
  /** True when at least one table could not be reached. */
  offline: boolean;
}

export interface SyncEngine {
  /** Upload every local change; bootstrap from the cloud once per collection. Single flight. */
  syncAll(): Promise<SyncReport>;
  /**
   * Asks the next syncs to also pull records missing locally (call it once per app open).
   * Stays pending per table until a pull succeeds. Never overwrites or deletes local data.
   */
  requestPullMissing(): void;
  /** Schedules a sync after `delayMs`, collapsing repeated requests (debounce). */
  requestSync(delayMs?: number): void;
  /** Stops timers (tests, unmount). */
  dispose(): void;
}

export interface SyncEngineOptions {
  /** Retry delays while changes stay pending (ms). The last value repeats. */
  retryDelays?: number[];
  onReport?(report: SyncReport): void;
}

const DEFAULT_RETRY_DELAYS = [30_000, 60_000, 120_000, 300_000];

export function createSyncEngine(entries: SyncEntry<any>[], options: SyncEngineOptions = {}): SyncEngine {
  const retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerDueAt = 0;
  let retryIndex = 0;
  let disposed = false;
  let inFlight: Promise<SyncReport> | null = null;
  let queued: Promise<SyncReport> | null = null;
  const pullRequested = new Set<string>();

  const pullInto = async (entry: SyncEntry<any>): Promise<number | null> => {
    const remote = await entry.remote.pull();
    if (!remote) return null;
    return entry.collection.mergeMissing(remote);
  };

  const syncEntry = async (entry: SyncEntry<any>, report: SyncReport) => {
    const { collection, remote } = entry;
    await collection.load();

    if (!collection.isBootstrapped() || pullRequested.has(collection.name)) {
      const added = await pullInto(entry);
      if (added === null) {
        report.offline = true;
      } else {
        report.restored += added;
        pullRequested.delete(collection.name);
        if (!collection.isBootstrapped()) await collection.setBootstrapped();
      }
    }

    const dirty = collection.getDirty();
    if (dirty.length > 0) {
      const confirmed = new Set(await remote.push(dirty));
      if (confirmed.size < dirty.length) report.offline = true;
      // Compare and clear: an edit made while uploading keeps the record dirty
      await collection.markClean(
        dirty.filter((r) => confirmed.has(r.data.id)).map((r) => ({ id: r.data.id, updatedAt: r.updatedAt }))
      );
      report.pushed += confirmed.size;
    }
    report.pending += collection.getDirty().length;
  };

  /** Keeps the earliest pending run: a retry backoff never delays a sync the user just triggered. */
  const schedule = (delayMs: number) => {
    if (disposed) return;
    const dueAt = Date.now() + delayMs;
    if (timer && timerDueAt <= dueAt) return;
    if (timer) clearTimeout(timer);
    timerDueAt = dueAt;
    timer = setTimeout(() => {
      timer = null;
      syncAll().catch(() => {});
    }, delayMs);
  };

  const finish = (report: SyncReport) => {
    if (report.pending > 0) {
      schedule(retryDelays[Math.min(retryIndex, retryDelays.length - 1)]);
      retryIndex++;
    } else {
      retryIndex = 0;
    }
    options.onReport?.(report);
    return report;
  };

  const runOnce = async (): Promise<SyncReport> => {
    const report: SyncReport = { pushed: 0, pending: 0, restored: 0, offline: false };
    // Tables are independent: one failing must not stop the others
    await Promise.all(
      entries.map((e) =>
        syncEntry(e, report).catch((err) => {
          console.warn(`Sync failed for ${e.collection.name}`, err);
          report.offline = true;
          report.pending += e.collection.getDirty().length;
        })
      )
    );
    return finish(report);
  };

  const start = (): Promise<SyncReport> => {
    inFlight = runOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  /**
   * Resolves once every change made before the call has been attempted. A run already in
   * progress may have read the pending records before that change, so callers arriving
   * meanwhile share one follow up run that starts as soon as the current one ends.
   */
  const syncAll = (): Promise<SyncReport> => {
    if (!inFlight) return start();
    if (!queued) {
      queued = inFlight
        .catch(() => undefined)
        .then(() => {
          queued = null;
          return start();
        });
    }
    return queued;
  };

  return {
    syncAll,
    requestPullMissing: () => {
      for (const e of entries) pullRequested.add(e.collection.name);
    },
    requestSync: (delayMs = 2000) => {
      retryIndex = 0;
      schedule(delayMs);
    },
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
