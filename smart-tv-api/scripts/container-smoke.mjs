import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
const { Response, Headers }=globalThis;
const {buildApp}=await import('/app/dist/app.js');
const {loadConfig}=await import('/app/dist/config.js');
const {openDatabase}=await import('/app/dist/db/index.js');
const {LibreTvClient}=await import('/app/dist/services/libretv-client.js');
const source={key:'test',name:'Synthetic source',url:'https://source.example/api'};
const config=loadConfig({LIBRETV_URL:'http://synthetic.invalid',LIBRETV_PASSWORD:'synthetic-password',SMART_TV_API_TOKEN:'synthetic-container-token-at-least-32-characters'});
const client=new LibreTvClient(config,async(input,init)=>{
  const path=new URL(String(input)).pathname;
  const headers={'Content-Type':'application/json'};
  const json=value=>new Response(JSON.stringify(value),{headers});
  if(path==='/api/auth') return new Response('{"success":true}',{headers:{...headers,'Set-Cookie':'ltv_session=synthetic; Max-Age=3600; HttpOnly'}});
  assert.equal(new Headers(init.headers).get('cookie'),'ltv_session=synthetic');
  if(path==='/api/status') return json({passwordRequired:true,verified:true,version:'2.19.2',defaultSources:[]});
  if(path==='/api/source-settings') return json({revision:1,data:{customAPIs:[source],selectedKeys:['test'],subscriptions:[],envKeysSeen:[]}});
  if(path==='/api/search') return json({list:[{sourceKey:'test',vodId:'1',name:'Synthetic Movie'}],failures:[]});
  if(path==='/api/detail') return json({videoInfo:{title:'Synthetic Movie'},episodes:['https://media.example/a.m3u8']});
  throw new Error('Unexpected path');
});
const database=openDatabase('/tmp/smart-tv-container-smoke.sqlite');
assert.equal(database.sqlite.pragma('journal_mode',{simple:true}),'wal');
assert.notEqual(process.getuid?.(),0);
const app=buildApp({config,client,database,logger:false});
try {
  assert.equal((await app.inject('/health')).statusCode,200);
  const headers={authorization:`Bearer ${config.apiToken}`};
  const search=await app.inject({url:'/api/v1/search?q=Movie',headers});assert.equal(search.statusCode,200);
  const item=search.json().items[0];assert(item);
  const detail=await app.inject({url:'/api/v1/movies/'+item.id,headers});assert.equal(detail.statusCode,200);
  assert.equal(detail.json().episodes.length,1);
  process.stdout.write(JSON.stringify({ok:true,platform:process.platform,arch:process.arch,compiledRuntime:true,sqliteNativeAddon:true,sqliteWal:true,nonRoot:true,readOnlyMockFlow:true})+'\n');
} finally {await app.close();}
