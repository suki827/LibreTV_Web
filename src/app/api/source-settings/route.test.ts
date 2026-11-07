import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SESSION_COOKIE, signSession } from '@/lib/auth';
import { GET, PUT } from './route';

let directory: string;
const sources = (name = '我的源') => ({
  customAPIs: [{ key: 'custom_0', name, url: 'https://source.example/api' }],
  selectedKeys: ['custom_0'],
  subscriptions: [{ url: 'https://subscription.example/list.json', enabled: false }],
  liveSubscriptions: [{ url: 'https://live.example/list.m3u', fromSubscriptions: [] }],
  liveSelectedUrls: [], envKeysSeen: [], liveEnvKeysSeen: [], envSubsSeen: [],
});
function request(method = 'GET', body?: unknown, authenticated = true, origin?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) headers.cookie = `${SESSION_COOKIE}=${signSession().token}`;
  if (origin) headers.origin = origin;
  return new Request('http://libretv.test/api/source-settings', {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'libretv-sources-'));
  process.env.SOURCE_SETTINGS_DIR = directory;
  process.env.PASSWORD = 'test-password';
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('shared source settings', () => {
  it('requires login for reading and writing', async () => {
    expect((await GET(request('GET', undefined, false))).status).toBe(401);
    expect((await PUT(request('PUT', { revision: 0, data: sources() }, false))).status).toBe(401);
  });
  it('persists all source types and disabled subscriptions across independent requests', async () => {
    expect(await (await GET(request())).json()).toEqual({ revision: 0, data: null });
    const res = await PUT(request('PUT', { revision: 0, data: sources() }));
    expect(res.status).toBe(200);
    expect(await (await GET(request())).json()).toEqual({ revision: 1, data: sources() });
    expect(JSON.parse(await readFile(path.join(directory, 'sources.json'), 'utf8'))).toEqual({ revision: 1, data: sources() });
    expect((await GET(request())).headers.get('cache-control')).toContain('no-store');
  });
  it('rejects stale writes instead of overwriting another computer', async () => {
    await PUT(request('PUT', { revision: 0, data: sources() }));
    const res = await PUT(request('PUT', { revision: 0, data: sources('过期修改') }));
    expect(res.status).toBe(409);
    expect((await (await GET(request())).json()).data).toEqual(sources());
  });
  it('serializes competing writes so exactly one wins', async () => {
    const results = await Promise.all(['A', 'B'].map(name => PUT(request('PUT', { revision: 0, data: sources(name) }))));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it('accepts retries of the identical committed document and retains the previous version', async () => {
    await PUT(request('PUT', { revision: 0, data: sources() }));
    expect((await PUT(request('PUT', { revision: 0, data: sources() }))).status).toBe(200);
    await PUT(request('PUT', { revision: 1, data: sources('新名称') }));
    const backup = JSON.parse(await readFile(path.join(directory, 'sources.previous.json'), 'utf8'));
    expect(backup.data).toEqual(sources());
  });
  it('rejects cross-origin writes, malformed data, and non-http source addresses', async () => {
    expect((await PUT(request('PUT', { revision: 0, data: sources() }, true, 'https://other.example'))).status).toBe(403);
    expect((await PUT(request('PUT', { revision: 0, data: {} }))).status).toBe(400);
    const bad = sources(); bad.customAPIs[0].url = 'file:///etc/passwd';
    expect((await PUT(request('PUT', { revision: 0, data: bad }))).status).toBe(400);
  });
  it('never stores browser history or preferences sent as extra fields', async () => {
    await PUT(request('PUT', { revision: 0, data: { ...sources(), viewingHistory: ['private'], yellowFilter: false } }));
    expect((await (await GET(request())).json()).data).toEqual(sources());
  });
  it('preserves the live config when the data file is corrupt', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(directory, 'sources.json'), 'corrupt');
    expect((await GET(request())).status).toBe(500);
    expect((await PUT(request('PUT', { revision: 0, data: sources() }))).status).toBe(500);
    expect(await readFile(path.join(directory, 'sources.json'), 'utf8')).toBe('corrupt');
  });
});
