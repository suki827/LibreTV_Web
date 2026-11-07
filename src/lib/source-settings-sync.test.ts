import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET, PUT } from '@/app/api/source-settings/route';
import { SESSION_COOKIE, signSession } from './auth';
import { findRecoverableSourceSettings, SourceSettingsSync } from './source-settings-sync';
import type { SourceSettings } from './source-settings';

let directory: string;
let offline = false;
const initial: SourceSettings = {
  customAPIs: [{ key: 'one', name: '原源', url: 'https://source.example/api' }],
  selectedKeys: ['one'], subscriptions: [], liveSubscriptions: [], liveSelectedUrls: [],
  envKeysSeen: [], liveEnvKeysSeen: [], envSubsSeen: [],
};
const transport = async (_url: string, options?: RequestInit): Promise<Response> => {
  if (offline) throw new Error('offline');
  const headers = new Headers(options?.headers);
  headers.set('cookie', `${SESSION_COOKIE}=${signSession().token}`);
  const req = new Request('http://libretv.test/api/source-settings', { ...options, headers });
  return options?.method === 'PUT' ? PUT(req) : GET(req);
};
function client(journal = new Map<string, string>(), request = transport, journalKey?: string) {
  let applied: SourceSettings | null = null;
  let status = '';
  const sync = new SourceSettingsSync({
    request,
    journalKey,
    apply: (value) => { applied = value; },
    status: (value) => { status = value; },
    journal: {
      getItem: key => journal.get(key) ?? null,
      setItem: (key, value) => { journal.set(key, value); },
      removeItem: key => { journal.delete(key); },
    },
  });
  return { sync, journal, applied: () => applied, status: () => status };
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'libretv-sync-'));
  process.env.SOURCE_SETTINGS_DIR = directory;
  process.env.PASSWORD = 'test-password';
  offline = false;
  await transport('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, data: initial }) });
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('source settings synchronization', () => {
  it('loads server sources before accepting edits, without uploading the old browser config', async () => {
    const a = client();
    expect(() => a.sync.change({ ...initial, customAPIs: [] })).toThrow();
    await a.sync.load();
    expect(a.applied()).toEqual(initial);
    expect(a.status()).toBe('saved');
    expect((await (await transport('')).json()).revision).toBe(1);
  });
  it('saves additions and disabled state, then another device loads the same configuration', async () => {
    const a = client(); await a.sync.load();
    const updated = { ...initial, selectedKeys: [], subscriptions: [{ url: 'https://subscription.example/list', enabled: false }] };
    a.sync.change(updated); await a.sync.flush();
    const b = client(); await b.sync.load();
    expect(b.applied()).toEqual(updated);
    expect(a.journal.size).toBe(0);
  });
  it('refreshes a clean device without sending its old source list back', async () => {
    const a = client(), b = client(); await a.sync.load(); await b.sync.load();
    const updated = { ...initial, selectedKeys: [] };
    a.sync.change(updated); await a.sync.flush(); await b.sync.refresh();
    expect(b.applied()).toEqual(updated);
    expect((await (await transport('')).json()).revision).toBe(2);
  });
  it('keeps unsaved changes in an outbox during network errors and recovers after reopening', async () => {
    const a = client(); await a.sync.load(); offline = true;
    const updated = { ...initial, selectedKeys: [] };
    a.sync.change(updated); await a.sync.flush();
    expect(a.status()).toBe('error');
    expect(a.journal.size).toBe(1);
    offline = false;
    const reopened = client(a.journal); await reopened.sync.load(); await reopened.sync.flush();
    expect((await (await transport('')).json()).data).toEqual(updated);
  });
  it('shows a conflict and preserves both copies instead of overwriting another device', async () => {
    const a = client(), b = client(); await a.sync.load(); await b.sync.load();
    const first = { ...initial, selectedKeys: [] };
    a.sync.change(first); await a.sync.flush();
    b.sync.change({ ...initial, subscriptions: [{ url: 'https://new.example/list' }] });
    await b.sync.flush();
    expect(b.status()).toBe('conflict');
    expect(b.journal.size).toBe(1);
    expect((await (await transport('')).json()).data).toEqual(first);
    await b.sync.refresh();
    expect(b.status()).toBe('conflict');
  });
  it('rejects a failed initial load instead of treating stale browser data as shared', async () => {
    offline = true;
    const a = client();
    await expect(a.sync.load()).rejects.toThrow();
    expect(a.applied()).toBeNull();
  });
  it('keeps a conflicting outbox stale across further edits and reopening', async () => {
    const a = client(), b = client(); await a.sync.load(); await b.sync.load();
    a.sync.change({ ...initial, selectedKeys: [] }); await a.sync.flush();
    b.sync.change({ ...initial, subscriptions: [{ url: 'https://new.example/list' }] });
    await b.sync.flush();
    const reopened = client(b.journal); await reopened.sync.load();
    reopened.sync.change({ ...initial, subscriptions: [{ url: 'https://third.example/list' }] });
    const again = client(b.journal); await again.sync.load(); await again.sync.flush();
    expect(again.status()).toBe('conflict');
    expect((await (await transport('')).json()).data.selectedKeys).toEqual([]);
    await again.sync.useServerVersion();
    expect(again.applied()?.selectedKeys).toEqual([]);
    expect(again.status()).toBe('saved');
    expect(b.journal.has('libretv-source-conflict-backup')).toBe(true);
  });
  it('does not roll back revision when an old GET arrives after a completed save', async () => {
    let delay = false;
    let release: (() => void) | undefined;
    let snapshotRead: (() => void) | undefined;
    const snapshotReady = new Promise<void>(resolve => { snapshotRead = resolve; });
    const a = client(new Map(), async (url, options) => {
      const response = await transport(url, options);
      if (delay && options?.method !== 'PUT') {
        snapshotRead?.();
        await new Promise<void>(resolve => { release = resolve; });
      }
      return response;
    });
    await a.sync.load(); delay = true;
    const refresh = a.sync.refresh(); await snapshotReady;
    a.sync.change({ ...initial, selectedKeys: [] }); await a.sync.flush();
    release?.(); await refresh; delay = false;
    a.sync.change({ ...initial, selectedKeys: [], subscriptions: [{ url: 'https://new.example/list' }] });
    await a.sync.flush();
    expect(a.status()).toBe('saved');
    expect((await (await transport('')).json()).data.selectedKeys).toEqual([]);
  });
  it('saves source lists larger than the browser keepalive limit', async () => {
    const a = client(new Map(), async (url, options) => {
      if (options?.keepalive && new TextEncoder().encode(String(options.body)).length > 65536) throw new Error('keepalive limit');
      return transport(url, options);
    });
    await a.sync.load();
    const large = { ...initial, customAPIs: Array.from({ length: 10 }, (_, i) => ({ key: `source_${i}`, name: 'A'.repeat(8000), url: 'https://source.example/api' })) };
    a.sync.change(large); await a.sync.flush();
    expect(a.status()).toBe('saved');
    expect((await (await transport('')).json()).data.customAPIs).toHaveLength(10);
  });
  it('keeps imported sources visible while a failed save waits for retry', async () => {
    const a = client(); await a.sync.load(); offline = true;
    const imported = { ...initial, selectedKeys: [] };
    await expect(a.sync.replace(imported)).rejects.toThrow();
    expect(a.applied()).toEqual(imported);
    expect(a.status()).toBe('error');
    offline = false; await a.sync.flush();
    expect((await (await transport('')).json()).data).toEqual(imported);
  });
  it('does not clear another tab\'s pending recovery copy', async () => {
    const journal = new Map<string, string>();
    const a = client(journal, transport, 'tab-a'), b = client(journal, transport, 'tab-b');
    await a.sync.load(); await b.sync.load();
    a.sync.change({ ...initial, selectedKeys: [] });
    b.sync.change({ ...initial, subscriptions: [{ url: 'https://new.example/list' }] });
    await b.sync.flush();
    expect(journal.has('tab-a')).toBe(true);
    expect(journal.has('tab-b')).toBe(false);
    const reopened = client(journal, transport, 'tab-a'); await reopened.sync.load();
    expect(reopened.status()).toBe('conflict');
  });
  it('discovers a closed tab\'s pending sources and recovers them in a fresh tab', async () => {
    const journal = new Map<string, string>();
    const a = client(journal, transport, 'libretv-source-outbox:closed'); await a.sync.load();
    const updated = { ...initial, selectedKeys: [] }; a.sync.change(updated);
    const storage = {
      get length() { return journal.size; },
      key: (index: number) => [...journal.keys()][index] ?? null,
      getItem: (key: string) => journal.get(key) ?? null,
    };
    const pending = findRecoverableSourceSettings(storage, 'libretv-source-outbox:fresh');
    expect(pending).toHaveLength(1);
    const fresh = client(journal, transport, 'libretv-source-outbox:fresh'); await fresh.sync.load();
    await fresh.sync.recover(pending[0].document);
    expect(fresh.applied()).toEqual(updated);
    expect(fresh.status()).toBe('saved');
    expect((await (await transport('')).json()).data).toEqual(updated);
    journal.set('libretv-source-recovered:' + pending[0].key, pending[0].serialized);
    expect(findRecoverableSourceSettings(storage, 'libretv-source-outbox:fresh')).toHaveLength(0);
    journal.set(pending[0].key, JSON.stringify({ revision: 1, data: initial }));
    expect(findRecoverableSourceSettings(storage, 'libretv-source-outbox:fresh')).toHaveLength(1);
  });
  it('retains the conflicting outbox when loading the server version fails', async () => {
    const a = client(), b = client(); await a.sync.load(); await b.sync.load();
    a.sync.change({ ...initial, selectedKeys: [] }); await a.sync.flush();
    b.sync.change({ ...initial, subscriptions: [{ url: 'https://new.example/list' }] }); await b.sync.flush();
    offline = true;
    await expect(b.sync.useServerVersion()).rejects.toThrow();
    expect(b.journal.has('libretv-source-outbox')).toBe(true);
  });
});
