import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCollection, LocalRecord, RemoteRecord } from '../data/collection';
import { RemoteTable } from '../data/remote';
import { createSyncEngine } from '../data/syncEngine';

interface Item {
  id: string;
  name: string;
  created_at?: string;
}

/** In-memory cloud with an online switch and an optional gate to hold a push in flight. */
function fakeRemote(initial: RemoteRecord<Item>[] = []) {
  const rows = new Map<string, RemoteRecord<Item>>(initial.map((r) => [r.data.id, r]));
  const ctl = {
    online: true,
    rejectIds: new Set<string>(),
    pushGate: null as Promise<void> | null,
    pushCalls: 0,
    rows,
  };
  const remote: RemoteTable<Item> = {
    table: 'items',
    async pull() {
      if (!ctl.online) return null;
      return [...rows.values()].map((r) => ({ data: { ...r.data }, deleted: r.deleted }));
    },
    async push(records: LocalRecord<Item>[]) {
      ctl.pushCalls++;
      if (ctl.pushGate) await ctl.pushGate;
      if (!ctl.online) return [];
      const ok: string[] = [];
      for (const r of records) {
        if (ctl.rejectIds.has(r.data.id)) continue;
        rows.set(r.data.id, { data: { ...r.data }, deleted: r.deleted });
        ok.push(r.data.id);
      }
      return ok;
    },
  };
  return { remote, ctl };
}

let seq = 0;
const newCollection = (key = `@test_${++seq}`) =>
  createCollection<Item>({ name: 'items', storageKey: key, sort: (a, b) => a.name.localeCompare(b.name) });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('Collection (local source of truth)', () => {
  it('persists every change and reloads it in a fresh instance', async () => {
    const key = '@persist';
    const a = newCollection(key);
    await a.upsert({ id: '1', name: 'Maria' });
    await a.upsert({ id: '2', name: 'Carlos' });
    await a.remove('2');

    const b = newCollection(key);
    await b.load();
    expect(b.getSnapshot().map((i) => i.id)).toEqual(['1']);
    expect(b.getDirty().map((r) => [r.data.id, r.deleted])).toEqual([
      ['1', false],
      ['2', true],
    ]);
  });

  it('never loses writes issued concurrently', async () => {
    const key = '@concurrent';
    const c = newCollection(key);
    await Promise.all(Array.from({ length: 50 }, (_, i) => c.upsert({ id: String(i), name: `n${i}` })));
    expect(c.getSnapshot()).toHaveLength(50);

    const reloaded = newCollection(key);
    await reloaded.load();
    expect(reloaded.getSnapshot()).toHaveLength(50);
  });

  it('remove is a tombstone and restore brings the same record back', async () => {
    const c = newCollection();
    await c.upsert({ id: '1', name: 'Maria' });
    await c.remove('1');
    expect(c.get('1')).toBeUndefined();
    await c.restore('1');
    expect(c.get('1')?.name).toBe('Maria');
  });

  it('keeps created_at stable across edits', async () => {
    const c = newCollection();
    const created = await c.upsert({ id: '1', name: 'Maria' });
    const edited = await c.upsert({ id: '1', name: 'Maria F' });
    expect(edited.created_at).toBe(created.created_at);
  });

  it('markClean does not clear a record edited after the upload started', async () => {
    const c = newCollection();
    await c.upsert({ id: '1', name: 'v1' });
    const [uploading] = c.getDirty();
    await c.upsert({ id: '1', name: 'v2' });
    await c.markClean([{ id: '1', updatedAt: uploading.updatedAt }]);
    expect(c.getDirty().map((r) => r.data.name)).toEqual(['v2']);
  });

  it('mergeMissing never overwrites or resurrects local records', async () => {
    const c = newCollection();
    await c.upsert({ id: '1', name: 'local edit' });
    await c.upsert({ id: '2', name: 'deleted locally' });
    await c.remove('2');

    const added = await c.mergeMissing([
      { data: { id: '1', name: 'cloud version' }, deleted: false },
      { data: { id: '2', name: 'cloud active' }, deleted: false },
      { data: { id: '3', name: 'only in cloud' }, deleted: false },
      { data: { id: '4', name: 'deleted in cloud' }, deleted: true },
    ]);

    expect(added).toBe(1);
    expect(c.getSnapshot().map((i) => i.name)).toEqual(['local edit', 'only in cloud']);
  });

  it('a failed disk write leaves memory unchanged and reports the error', async () => {
    const c = newCollection();
    await c.upsert({ id: '1', name: 'Maria' });
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(c.upsert({ id: '2', name: 'Carlos' })).rejects.toThrow('disk full');
    expect(c.getSnapshot().map((i) => i.id)).toEqual(['1']);
    await c.upsert({ id: '3', name: 'Ana' }); // the queue keeps working afterwards
    expect(c.getSnapshot().map((i) => i.id)).toEqual(['3', '1']);
  });

  it('notifies subscribers and keeps the snapshot reference stable between changes', async () => {
    const c = newCollection();
    await c.load();
    const listener = jest.fn();
    c.subscribe(listener);
    const before = c.getSnapshot();
    expect(c.getSnapshot()).toBe(before);
    await c.upsert({ id: '1', name: 'Maria' });
    expect(listener).toHaveBeenCalled();
    expect(c.getSnapshot()).not.toBe(before);
  });
});

describe('Sync engine (push only, cloud is a backup)', () => {
  it('uploads changes made offline once the connection is back', async () => {
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }], { retryDelays: [60_000] });

    ctl.online = false;
    await c.upsert({ id: '1', name: 'Maria' });
    await c.upsert({ id: '2', name: 'Carlos' });
    await c.remove('2');
    const offline = await engine.syncAll();
    expect(offline).toMatchObject({ offline: true, pending: 2 });

    ctl.online = true;
    const online = await engine.syncAll();
    expect(online).toMatchObject({ pending: 0, pushed: 2 });
    expect(ctl.rows.get('1')).toEqual({ data: expect.objectContaining({ name: 'Maria' }), deleted: false });
    expect(ctl.rows.get('2')?.deleted).toBe(true);
    engine.dispose();
  });

  it('a change made while a push is in flight is not lost and is uploaded next', async () => {
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }]);
    await c.upsert({ id: '1', name: 'v1' });
    await engine.syncAll(); // bootstrap done

    await c.upsert({ id: '1', name: 'v2' });
    let release!: () => void;
    ctl.pushGate = new Promise<void>((r) => (release = r));
    const running = engine.syncAll();
    await new Promise((r) => setTimeout(r, 10));

    await c.upsert({ id: '1', name: 'v3' }); // edit during upload
    await c.upsert({ id: '9', name: 'nuevo' }); // create during upload
    ctl.pushGate = null;
    release();
    const report = await running;
    expect(report.pending).toBe(2);

    await engine.syncAll();
    expect(ctl.rows.get('1')?.data.name).toBe('v3');
    expect(ctl.rows.has('9')).toBe(true);
    expect(c.getDirty()).toHaveLength(0);
    engine.dispose();
  });

  it('syncAll called during a run resolves only after the new change is uploaded', async () => {
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }]);
    let release!: () => void;
    ctl.pushGate = new Promise<void>((r) => (release = r));
    await c.upsert({ id: '1', name: 'A' });
    const first = engine.syncAll();
    await new Promise((r) => setTimeout(r, 10));

    await c.upsert({ id: '2', name: 'B' }); // the running sync already read its pending list
    const second = engine.syncAll();
    const third = engine.syncAll();
    expect(third).toBe(second); // one shared follow up run
    ctl.pushGate = null;
    release();
    await first;
    await second;

    expect(ctl.rows.has('2')).toBe(true);
    expect(c.getDirty()).toHaveLength(0);
    engine.dispose();
  });

  it('the server never overwrites or deletes local data', async () => {
    const c = newCollection();
    await c.upsert({ id: '1', name: 'local' });
    await c.setBootstrapped();
    await c.markClean(c.getDirty().map((r) => ({ id: r.data.id, updatedAt: r.updatedAt })));
    const { remote, ctl } = fakeRemote([{ data: { id: '1', name: 'cloud' }, deleted: true }]);
    const engine = createSyncEngine([{ collection: c, remote }]);

    await engine.syncAll();
    engine.requestPullMissing();
    await engine.syncAll();

    expect(c.getSnapshot().map((i) => i.name)).toEqual(['local']);
    expect(ctl.rows.get('1')?.data.name).toBe('cloud'); // nothing dirty, nothing pushed
    engine.dispose();
  });

  it('bootstraps a fresh install from the cloud, deleted rows stay deleted', async () => {
    const c = newCollection();
    const { remote } = fakeRemote([
      { data: { id: '1', name: 'Maria' }, deleted: false },
      { data: { id: '2', name: 'Borrada' }, deleted: true },
    ]);
    const engine = createSyncEngine([{ collection: c, remote }]);

    const report = await engine.syncAll();

    expect(report.restored).toBe(1);
    expect(c.getSnapshot().map((i) => i.id)).toEqual(['1']);
    expect(c.getDirty()).toHaveLength(0);
    engine.dispose();
  });

  it('bootstrap waits for a connection and keeps records created offline meanwhile', async () => {
    const c = newCollection();
    const { remote, ctl } = fakeRemote([{ data: { id: 'cloud', name: 'Del respaldo' }, deleted: false }]);
    const engine = createSyncEngine([{ collection: c, remote }], { retryDelays: [60_000] });

    ctl.online = false;
    await c.upsert({ id: 'local', name: 'Creada offline' });
    await engine.syncAll();
    expect(c.isBootstrapped()).toBe(false);

    ctl.online = true;
    await engine.syncAll();
    expect(c.getSnapshot().map((i) => i.id).sort()).toEqual(['cloud', 'local']);
    expect(ctl.rows.has('local')).toBe(true);
    engine.dispose();
  });

  it('one rejected record does not block the others and stays pending', async () => {
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }], { retryDelays: [60_000] });
    ctl.rejectIds.add('bad');
    await c.upsert({ id: 'ok', name: 'A' });
    await c.upsert({ id: 'bad', name: 'B' });

    const report = await engine.syncAll();

    expect(report).toMatchObject({ pushed: 1, pending: 1 });
    expect(c.getDirty().map((r) => r.data.id)).toEqual(['bad']);
    engine.dispose();
  });

  it('a failing table does not stop the other tables', async () => {
    const good = newCollection();
    const broken = newCollection();
    const { remote: goodRemote, ctl } = fakeRemote();
    const brokenRemote: RemoteTable<Item> = {
      table: 'broken',
      pull: async () => [],
      push: async () => {
        throw new Error('boom');
      },
    };
    const engine = createSyncEngine(
      [
        { collection: broken, remote: brokenRemote },
        { collection: good, remote: goodRemote },
      ],
      { retryDelays: [60_000] }
    );
    await broken.upsert({ id: 'x', name: 'X' });
    await good.upsert({ id: 'y', name: 'Y' });

    const report = await engine.syncAll();

    expect(ctl.rows.has('y')).toBe(true);
    expect(report.pending).toBe(1);
    engine.dispose();
  });

  it('retries automatically with backoff while changes are pending', async () => {
    jest.useFakeTimers();
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }], { retryDelays: [1000, 5000] });
    ctl.online = false;
    await c.upsert({ id: '1', name: 'Maria' });
    await engine.syncAll();
    const callsAfterFirst = ctl.pushCalls;

    ctl.online = true;
    await jest.advanceTimersByTimeAsync(1000);

    expect(ctl.pushCalls).toBe(callsAfterFirst + 1);
    expect(ctl.rows.has('1')).toBe(true);
    expect(c.getDirty()).toHaveLength(0);
    engine.dispose();
  });

  it('requestSync debounces and is not delayed by a pending retry backoff', async () => {
    jest.useFakeTimers();
    const c = newCollection();
    const { remote, ctl } = fakeRemote();
    const engine = createSyncEngine([{ collection: c, remote }], { retryDelays: [60_000] });
    ctl.online = false;
    await c.upsert({ id: '1', name: 'Maria' });
    await engine.syncAll(); // schedules a 60 s retry
    ctl.online = true;

    await c.upsert({ id: '2', name: 'Carlos' });
    engine.requestSync(2000);
    engine.requestSync(2000);
    await jest.advanceTimersByTimeAsync(2000);

    expect(ctl.rows.has('1')).toBe(true);
    expect(ctl.rows.has('2')).toBe(true);
    engine.dispose();
  });
});
