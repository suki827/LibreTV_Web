import { vi } from 'vitest';
import { loadConfig } from '../src/config.js';
export const config = () => loadConfig({ LIBRETV_URL: 'http://libretv.test:8080', LIBRETV_PASSWORD: 'synthetic-password', SMART_TV_API_TOKEN: 'synthetic-tv-token-at-least-32-characters' });
export const source = (key: string) => ({ key, name: `Source ${key}`, url: `https://${key}.example/api` });
export const status = { passwordRequired: true, verified: true, version: '2.19.2', defaultSources: [], defaultLiveSources: [], defaultSubscriptions: [] };
export const settings = { revision: 1, data: { customAPIs: [source('a'), source('b')], selectedKeys: ['a','b'], subscriptions: [], envKeysSeen: [] } };
export const row = (key = 'a', id = '123') => ({ sourceKey: key, sourceName: `Source ${key}`, vodId: id, name: ' 流浪地球 ', year: '2019', typeName: '科幻片', pic: 'https://image.example/a.jpg', sourceUrl: `https://${key}.example/api` });
export function json(value: unknown, statusCode = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(value), { status: statusCode, headers: { 'Content-Type': 'application/json', ...headers } });
}
export function network(handler?: (url: URL, init: RequestInit) => Response | Promise<Response | undefined> | undefined) {
  const calls: { path: string; method: string; body: unknown; cookie: string | null }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    const init = options ?? {};
    calls.push({ path: url.pathname, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) as unknown : undefined, cookie: new Headers(init.headers).get('cookie') });
    const customized = await handler?.(url, init);
    if (customized) return customized;
    if (url.pathname === '/api/auth') return json({ success: true }, 200, { 'Set-Cookie': 'ltv_session=synthetic-session; Path=/; Max-Age=3600; HttpOnly' });
    if (url.pathname === '/api/status') return json(status);
    if (url.pathname === '/api/source-settings') return json(settings);
    if (url.pathname === '/api/search') return json({ list: [row()], failures: [] });
    if (url.pathname === '/api/detail') return json({ videoInfo: { title: '流浪地球', year: '2019' }, episodes: ['https://media.example/episode1.m3u8'] });
    throw new Error('Unexpected URL: ' + url.pathname);
  });
  return { fetcher, calls };
}
