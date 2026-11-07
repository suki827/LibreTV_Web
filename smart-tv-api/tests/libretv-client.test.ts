import { describe, expect, it } from 'vitest';
import { LibreTvClient } from '../src/services/libretv-client.js';
import { subKeyPrefix } from '../src/services/source-selection.js';
import { config, json, network, row, settings, source, status } from './fixtures.js';

const authCalls = (calls: ReturnType<typeof network>['calls']) => calls.filter(c => c.path === '/api/auth').length;
describe('read-only customized LibreTV adapter', () => {
  it('authenticates once, reuses only the session cookie, and calls actual search/detail contracts', async () => {
    const { fetcher, calls } = network(); const client = new LibreTvClient(config(), fetcher);
    const result = await client.search('流浪');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe('流浪地球');
    expect(result.sourceCount).toBe(2);
    await client.detail(source('a'), '123');
    expect(authCalls(calls)).toBe(1);
    expect(calls.find(c => c.path === '/api/search')).toMatchObject({ method: 'POST', body: { wd: '流浪', sources: [source('a'), source('b')], filterAdult: true }, cookie: 'ltv_session=synthetic-session' });
    expect(calls.filter(c => c.path !== '/api/auth').every(c => c.cookie === 'ltv_session=synthetic-session')).toBe(true);
    expect(calls.every(c => c.path !== '/api/source-settings' || c.method === 'GET')).toBe(true);
  });
  it('respects selected keys, disabled subscriptions, duplicate keys and unseen environment defaults', async () => {
    const subscription = 'https://subscriptions.example/list.json'; const prefix = subKeyPrefix(subscription);
    const { fetcher } = network(url => {
      if (url.pathname === '/api/status') return json({ ...status, defaultSources: [source('env_0'),source('env_1')] });
      if (url.pathname === '/api/source-settings') return json({ revision: 2, data: { customAPIs: [source('a'), source('off'), source(prefix + '_0'), source(prefix + 'x_0')], selectedKeys: ['a','a','missing',prefix + '_0', prefix + 'x_0'], subscriptions: [{ url: subscription, enabled: false }], envKeysSeen: ['env_0'] } });
    });
    const enabled = await new LibreTvClient(config(), fetcher).enabledSources();
    expect(enabled.map(s => s.key)).toEqual(['a',prefix + 'x_0','env_1']);
  });
  it('does not restore manually unchecked defaults or drop a partially configured source document', async () => {
    const { fetcher } = network(url => url.pathname === '/api/source-settings' ? json({ revision: 1, data: {} }) : undefined);
    await expect(new LibreTvClient(config(), fetcher).enabledSources()).rejects.toMatchObject({ code: 'LIBRETV_INVALID_RESPONSE' });
  });
  it('batches all enabled sources beyond upstream limit of 50 and isolates results by request', async () => {
    const many = Array.from({ length: 103 }, (_, i) => source('s' + i));
    const { fetcher, calls } = network((url, init) => {
      if (url.pathname === '/api/source-settings') return json({ revision: 1, data: { ...settings.data, customAPIs: many, selectedKeys: many.map(s => s.key) } });
      if (url.pathname === '/api/search') {
        const body = JSON.parse(String(init.body)) as { wd: string; sources: { key: string }[] };
        return json({ list: body.sources.map(s => ({ ...row(s.key), name: body.wd })), failures: [] });
      }
    });
    const client = new LibreTvClient(config(), fetcher);
    const [a,b] = await Promise.all([client.search('甲'),client.search('乙')]);
    expect(a.rows).toHaveLength(103); expect(b.rows).toHaveLength(103);
    expect(a.rows.every(r => r.title === '甲')).toBe(true); expect(b.rows.every(r => r.title === '乙')).toBe(true);
    const batches = calls.filter(c => c.path === '/api/search');
    expect(batches).toHaveLength(6);
    expect(batches.every(c => (c.body as { sources: unknown[] }).sources.length <= 50)).toBe(true);
    expect(authCalls(calls)).toBe(1);
  });
  it('never uploads browser health state; reports sanitized upstream failures separately', async () => {
    const { fetcher } = network(url => url.pathname === '/api/search' ? json({ list: [row()], failures: [{ sourceKey: 'b', error: 'private URL and details', timedOut: true }] }) : undefined);
    const result = await new LibreTvClient(config(), fetcher).search('流浪');
    expect(result.failures).toEqual([{ sourceId: 'b', code: 'SOURCE_TIMEOUT' }]);
    expect(JSON.stringify(result)).not.toContain('private URL');
  });
  it('fails when every upstream source fails, distinguishing an empty successful search', async () => {
    const failed = network(url => url.pathname === '/api/search' ? json({ list: [], failures: [{ sourceKey: 'a', error: 'x' },{ sourceKey: 'b', error: 'x' }] }) : undefined);
    await expect(new LibreTvClient(config(), failed.fetcher).search('流浪')).rejects.toMatchObject({ code: 'SEARCH_FAILED' });
    const empty = network(url => url.pathname === '/api/search' ? json({ list: [], failures: [] }) : undefined);
    expect((await new LibreTvClient(config(), empty.fetcher).search('流浪')).rows).toEqual([]);
  });
  it('refreshes expired sessions once and shares concurrent reauthentication', async () => {
    let expire = false;
    const { fetcher, calls } = network((url, init) => {
      if (url.pathname === '/api/auth' && expire) return json({ success: true },200,{ 'Set-Cookie':'ltv_session=new-session; Max-Age=3600; HttpOnly' });
      if (expire && url.pathname !== '/api/auth' && new Headers(init.headers).get('cookie') !== 'ltv_session=new-session') return json({},401);
    });
    const client = new LibreTvClient(config(), fetcher); await client.enabledSources(); expire = true;
    await Promise.all([client.enabledSources(), client.enabledSources(), client.enabledSources()]);
    expect(authCalls(calls)).toBe(2);
  });
  it('bounds authentication failures and does not reveal upstream response bodies', async () => {
    const { fetcher, calls } = network(url => url.pathname === '/api/auth' ? json({ error: 'private-password' },401) : undefined);
    const client = new LibreTvClient(config(), fetcher);
    for (let i=0;i<3;i++) await expect(client.enabledSources()).rejects.toMatchObject({ code: 'LIBRETV_AUTH_FAILED', message: 'LibreTV authentication failed' });
    expect(authCalls(calls)).toBe(1);
  });
  it('rejects redirects without forwarding credentials to another destination', async () => {
    const { fetcher, calls } = network(url => url.pathname === '/api/auth' ? new Response(null,{ status:302, headers:{ Location:'http://other.invalid/' } }) : undefined);
    await expect(new LibreTvClient(config(), fetcher).enabledSources()).rejects.toMatchObject({ code: 'LIBRETV_REDIRECT' });
    expect(calls).toHaveLength(1);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
  it('rejects malformed JSON, wrong schemas and oversized response streams', async () => {
    for (const response of [new Response('bad',{headers:{'Content-Type':'application/json'}}),json({oops:[]}),json({ list: [row('unconfigured')], failures: [] }),json({list:[],failures:[],padding:'x'.repeat(5000)})]) {
      const { fetcher } = network(url => url.pathname === '/api/search' ? response : undefined);
      await expect(new LibreTvClient({ ...config(), maxResponseBytes:1024 }, fetcher).search('流浪')).rejects.toMatchObject({ statusCode:502 });
    }
  });
  it('times out requests including delayed bodies and supports caller cancellation', async () => {
    const slow = network((url, init) => url.pathname === '/api/auth' ? new Promise((_resolve,reject) => { init.signal?.addEventListener('abort',()=>reject(new Error('private failure')),{once:true}); }) : undefined);
    await expect(new LibreTvClient({ ...config(),upstreamTimeoutMs:30 },slow.fetcher).enabledSources()).rejects.toMatchObject({ code:'LIBRETV_TIMEOUT' });
    const body = network(url => url.pathname === '/api/source-settings' ? new Response(new ReadableStream({ start() {} }),{headers:{'Content-Type':'application/json'}}) : undefined);
    await expect(new LibreTvClient({ ...config(),upstreamTimeoutMs:30 },body.fetcher).enabledSources()).rejects.toMatchObject({ code:'LIBRETV_TIMEOUT' });
    const aborted = new AbortController(); aborted.abort();
    await expect(new LibreTvClient(config(),network().fetcher).search('流浪',aborted.signal)).rejects.toMatchObject({ code:'REQUEST_CANCELLED' });
  });
  it('bounds simultaneous upstream requests globally across callers', async () => {
    let active=0,peak=0;
    const { fetcher } = network(async () => { active++; peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,5)); active--; return undefined; });
    const client = new LibreTvClient({ ...config(), upstreamConcurrency:2 }, fetcher);
    await Promise.all(Array.from({length:8},()=>client.enabledSources()));
    expect(peak).toBeLessThanOrEqual(2);
  });
  it('rejects caller-controlled detail IDs without issuing detail requests', async () => {
    const { fetcher,calls } = network();
    await expect(new LibreTvClient(config(),fetcher).detail(source('a'),'../private')).rejects.toMatchObject({ statusCode:400 });
    expect(calls).toHaveLength(0);
  });
});

describe('search result memory bound',()=>{
  it('explicitly reports truncation when the result count exceeds its configured cap',async()=>{
    const {fetcher}=network(url=>url.pathname==='/api/search'?json({list:Array.from({length:1500},(_,i)=>row('a',String(i))),failures:[]}):undefined);
    const result=await new LibreTvClient(config(),fetcher).search('流浪');
    expect(result.rows).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });
});

describe('optional upstream artwork',()=>{
  it('does not reject otherwise valid search/details when artwork is empty or invalid',async()=>{
    const {fetcher}=network(url=>{
      if(url.pathname==='/api/search') return json({list:[{...row(),pic:''},{...row('b'),pic:'javascript:bad'}],failures:[]});
      if(url.pathname==='/api/detail') return json({videoInfo:{title:'Valid movie',cover:''},episodes:['https://media.example/one.m3u8']});
    });
    const client=new LibreTvClient(config(),fetcher);
    expect((await client.search('流浪')).rows).toHaveLength(2);
    expect((await client.detail(source('a'),'123')).videoInfo.cover).toBeUndefined();
  });
});

describe('fresh-session rejection',()=>{
  it('backs off after a fresh cookie is rejected, without repeated logins on later requests',async()=>{
    const {fetcher,calls}=network(url=>url.pathname==='/api/auth'?undefined:json({},401));
    const client=new LibreTvClient(config(),fetcher);
    for(let i=0;i<3;i++) await expect(client.enabledSources()).rejects.toMatchObject({code:'LIBRETV_AUTH_FAILED'});
    expect(authCalls(calls)).toBe(2);
  });
});
