import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';
import { LibreTvClient } from '../src/services/libretv-client.js';
import { config, json, network, row, settings, source } from './fixtures.js';
import type { FastifyInstance } from 'fastify';
const apps:FastifyInstance[]=[];
const authorization=()=>({authorization:`Bearer ${config().apiToken}`});
function setup(handler?: Parameters<typeof network>[0]) {
  const net=network(handler); const db=openDatabase(':memory:');
  const app=buildApp({config:config(),client:new LibreTvClient(config(),net.fetcher),database:db,logger:false});
  apps.push(app);
  return {...net,db,app};
}
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});

describe('phase-one HTTP API',()=>{
  it('runs the full authenticated enabled-source → search → per-source details flow',async()=>{
    const {app,calls}=setup();
    const health=await app.inject({method:'GET',url:'/health'});
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({status:'ok',checks:{libretv:'ok',database:'ok'}});
    const result=await app.inject({method:'GET',url:'/api/v1/search?q='+encodeURIComponent(' 流浪 '),headers:authorization()});
    expect(result.statusCode).toBe(200);
    const data=result.json();
    expect(data.query).toBe('流浪');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({title:'流浪地球',year:'2019',source:{id:'a',name:'Source a'}});
    expect(JSON.stringify(data)).not.toContain('https://a.example');
    const detail=await app.inject({method:'GET',url:'/api/v1/movies/'+data.items[0].id,headers:authorization()});
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({id:data.items[0].id,title:'流浪地球',episodes:[{number:1,url:'https://media.example/episode1.m3u8'}]});
    expect(calls.filter(c=>c.path==='/api/auth')).toHaveLength(1);
    expect(calls.every(c=>['/api/auth','/api/status','/api/source-settings','/api/search','/api/detail'].includes(c.path))).toBe(true);
  });
  it('requires the TV bearer token without contacting LibreTV for unauthorized/invalid API calls',async()=>{
    const {app,calls}=setup();
    for(const headers of [{},{authorization:'Bearer wrong'},{authorization:`Bearer ${config().libretvPassword}`}]) {
      const res=await app.inject({url:'/api/v1/search?q=test',headers});
      expect(res.statusCode).toBe(401);
    }
    for(const url of ['/api/v1/search','/api/v1/search?q=%20','/api/v1/search?q=x&source=http://127.0.0.1','/api/v1/search?q='+ 'x'.repeat(101),'/api/v1/movies/not-a-valid-id']) {
      const res=await app.inject({url,headers:authorization()}); expect(res.statusCode).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
  it('keeps same-name cross-source results separate and gives stable restart-safe IDs',async()=>{
    const handler:Parameters<typeof network>[0]=url=>url.pathname==='/api/search'?json({list:[row('a'),row('b'),row('a')],failures:[]}):undefined;
    const a=setup(handler),b=setup(handler);
    const first=(await a.app.inject({url:'/api/v1/search?q=test',headers:authorization()})).json();
    const second=(await b.app.inject({url:'/api/v1/search?q=test',headers:authorization()})).json();
    expect(first.items).toHaveLength(2);
    expect(first.items.map((item:{id:string})=>item.id)).toEqual(second.items.map((item:{id:string})=>item.id));
    expect(first.items[0].id).not.toBe(first.items[1].id);
  });
  it('rejects tampered IDs and no longer uses disabled/changed sources',async()=>{
    let changed=false;
    const {app,calls}=setup(url=>changed&&url.pathname==='/api/source-settings'?json({...settings,data:{...settings.data,selectedKeys:['b']}}):undefined);
    const item=(await app.inject({url:'/api/v1/search?q=test',headers:authorization()})).json().items[0];
    const tampered=item.id.slice(0,-2)+'aa';
    expect((await app.inject({url:'/api/v1/movies/'+tampered,headers:authorization()})).statusCode).toBe(400);
    changed=true;
    expect((await app.inject({url:'/api/v1/movies/'+item.id,headers:authorization()})).statusCode).toBe(404);
    expect(calls.some(c=>c.path==='/api/detail')).toBe(false);
  });
  it('binds an ID to the source URL so reusing a source key cannot play a different film',async()=>{
    let changed=false;
    const {app,calls}=setup(url=>changed&&url.pathname==='/api/source-settings'?json({...settings,data:{...settings.data,customAPIs:[{...source('a'),url:'https://replacement.example/api'},source('b')]}}):undefined);
    const item=(await app.inject({url:'/api/v1/search?q=test',headers:authorization()})).json().items[0]; changed=true;
    expect((await app.inject({url:'/api/v1/movies/'+item.id,headers:authorization()})).statusCode).toBe(404);
    expect(calls.some(c=>c.path==='/api/detail')).toBe(false);
  });
  it('distinguishes empty/partial results and sanitizes unavailable service errors',async()=>{
    const empty=setup(url=>url.pathname==='/api/source-settings'?json({...settings,data:{...settings.data,selectedKeys:[]}}):undefined);
    const res=await empty.app.inject({url:'/api/v1/search?q=test',headers:authorization()});
    expect(res.statusCode).toBe(200); expect(res.json()).toMatchObject({items:[],source_count:0,partial:false});
    expect(empty.calls.some(c=>c.path==='/api/search')).toBe(false);
    const broken=setup(()=>{throw new Error('private credentials and URL');});
    const failed=await broken.app.inject({url:'/api/v1/search?q=test',headers:authorization()});
    expect(failed.statusCode).toBe(503); expect(failed.body).not.toContain('private');
    expect((await broken.app.inject('/health')).statusCode).toBe(503);
  });
  it('reports a closed database as unhealthy',async()=>{
    const {app,db}=setup(); db.close();
    const res=await app.inject('/health'); expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({status:'degraded',checks:{database:'unavailable'}});
  });
});

describe('movie identifier encoded bounds',()=>{
  it('round-trips maximum schema-valid Unicode and escaped source keys through the detail route',async()=>{
    for(const key of ['中'.repeat(256),'\u0000'.repeat(256)]) {
      const longSource={...source('a'),key};
      const {app}=setup(url=>{
        if(url.pathname==='/api/source-settings')return json({...settings,data:{...settings.data,customAPIs:[longSource],selectedKeys:[key]}});
        if(url.pathname==='/api/search')return json({list:[row(key,'1'.repeat(128))],failures:[]});
      });
      const result=await app.inject({url:'/api/v1/search?q=流浪',headers:authorization()});
      expect(result.statusCode).toBe(200);
      const id=result.json().items[0].id;
      expect((await app.inject({url:'/api/v1/movies/'+id,headers:authorization()})).statusCode).toBe(200);
    }
  });
});
