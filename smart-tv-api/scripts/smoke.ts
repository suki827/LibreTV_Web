import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { buildApp } from '../src/app.js';

const directory=mkdtempSync(join(tmpdir(),'smart-tv-smoke-'));
const source={key:'smoke',name:'Synthetic source',url:'https://source.example/api'};
const paths:string[]=[];
let logins=0;
const backend=createServer((request,response)=>{
  void (async()=>{
    const url=new URL(request.url??'/', 'http://localhost');
    const chunks:Buffer[]=[];
    for await(const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
    paths.push(`${request.method} ${url.pathname}`);
    response.setHeader('Content-Type','application/json');
    const send=(data:unknown,status=200)=>{response.statusCode=status;response.end(JSON.stringify(data));};
    if(url.pathname==='/api/auth'&&request.method==='POST') {
      const body=JSON.parse(Buffer.concat(chunks).toString()) as {password?:string};
      if(body.password!=='synthetic-smoke-password') return send({},401);
      logins++; response.setHeader('Set-Cookie','ltv_session=smoke-session; Max-Age=3600; HttpOnly; Path=/');
      return send({success:true});
    }
    if(request.headers.cookie!=='ltv_session=smoke-session') return send({},401);
    if(url.pathname==='/api/status') return send({passwordRequired:true,verified:true,version:'2.19.2',defaultSources:[]});
    if(url.pathname==='/api/source-settings'&&request.method==='GET') return send({revision:1,data:{customAPIs:[source],selectedKeys:['smoke'],subscriptions:[],envKeysSeen:[]}});
    if(url.pathname==='/api/search'&&request.method==='POST') return send({list:[{sourceKey:'smoke',sourceName:'Synthetic source',vodId:'42',name:'Synthetic Movie',year:'2019'}],failures:[]});
    if(url.pathname==='/api/detail'&&request.method==='GET') return send({videoInfo:{title:'Synthetic Movie',year:'2019'},episodes:['https://media.example/first.m3u8']});
    return send({},404);
  })().catch(()=>{response.statusCode=500;response.end('{}');});
});
const closeBackend=()=>new Promise<void>((resolve,reject)=>{backend.close(error=>error?reject(error):resolve());backend.closeAllConnections();});
async function run() {
  backend.listen(0,'127.0.0.1'); await once(backend,'listening');
  const address=backend.address();assert(address&&typeof address==='object');
  const config=loadConfig({LIBRETV_URL:`http://127.0.0.1:${address.port}`,LIBRETV_PASSWORD:'synthetic-smoke-password',SMART_TV_API_TOKEN:'synthetic-tv-smoke-token-at-least-32-characters',DATABASE_PATH:join(directory,'test.sqlite')});
  const app=buildApp({config,database:openDatabase(config.databasePath),logger:false});
  try {
    const url=await app.listen({host:'127.0.0.1',port:0});
    const health=await fetch(url+'/health');assert.equal(health.status,200);await health.arrayBuffer();
    const denied=await fetch(url+'/api/v1/search?q=Movie');assert.equal(denied.status,401);await denied.arrayBuffer();
    const headers={Authorization:`Bearer ${config.apiToken}`};
    const search=await fetch(url+'/api/v1/search?q=Movie',{headers});assert.equal(search.status,200);
    const data=await search.json() as {items:{id:string;title:string}[]};assert.equal(data.items.length,1);
    const item=data.items[0];assert(item);
    const detail=await fetch(url+'/api/v1/movies/'+item.id,{headers});assert.equal(detail.status,200);
    const movie=await detail.json() as {episodes:{number:number;url:string}[]};assert.equal(movie.episodes[0]?.number,1);
    assert.equal(logins,1);assert(!paths.some(path=>path.startsWith('PUT ')));
    process.stdout.write(JSON.stringify({ok:true,transport:'real local HTTP',checks:['readiness','bearer auth','cookie reuse','enabled sources','search','detail','read-only upstream'],database:'isolated SQLite WAL',productionAccess:false})+'\n');
  } finally {await app.close();}
}
try {await run();} finally {await closeBackend();rmSync(directory,{recursive:true,force:true});}
