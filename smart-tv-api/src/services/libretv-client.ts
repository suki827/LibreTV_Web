import { z } from 'zod';
import type { Config } from '../config.js';
import { ServiceError, invalidResponse, unavailable } from '../errors.js';
import { detailSchema, searchSchema, settingsSchema, sourceSchema, statusSchema, videoIdSchema, type Source } from '../schemas/libretv.js';
import { LibreTvHttp, cancelled } from './libretv-http.js';
import { selectEnabledSources } from './source-selection.js';

export interface SearchRow {
  source:Source; videoId:string; title:string;
  cover?:string; year?:string; typeName?:string; area?:string; remarks?:string;
}
export interface SourceFailure { sourceId:string; code:'SOURCE_FAILED'|'SOURCE_TIMEOUT'|'BATCH_FAILED' }
export interface SearchResults { rows:SearchRow[]; failures:SourceFailure[]; sourceCount:number; truncated:boolean }
function parse<T>(schema:z.ZodType<T>, value:unknown):T { const result=schema.safeParse(value); if (!result.success) throw invalidResponse(); return result.data; }
function authFailed() { return new ServiceError('LIBRETV_AUTH_FAILED',503,'LibreTV authentication failed'); }
function waitWithSignal<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(cancelled());
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort)).catch(()=>{});
  });
}
export class LibreTvClient {
  private http:LibreTvHttp;
  private cookie='';
  private expiresAt=0;
  private loginPromise:Promise<void>|undefined;
  private authRetryAt=0;
  constructor(private config:Config, fetchImpl:typeof fetch=fetch) { this.http=new LibreTvHttp(config,fetchImpl); }
  private async login():Promise<void> {
    const response=await this.http.send('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:this.config.libretvPassword})});
    if (response.status!==200 || !z.object({success:z.literal(true)}).safeParse(response.data).success) throw authFailed();
    const values=response.headers.getSetCookie();
    const raw=values.find(value=>value.startsWith('ltv_session='));
    const token=raw?.split(';')[0];
    if (!raw || !token || token.length>4096 || !/^ltv_session=[^;\s]+$/.test(token)) throw authFailed();
    const maxAge=Number(/(?:^|;)\s*Max-Age=(\d+)/i.exec(raw)?.[1] ?? '60');
    if (!Number.isFinite(maxAge)||maxAge<=0) throw authFailed();
    this.cookie=token; this.expiresAt=Date.now()+Math.min(maxAge,90*86400)*1000; this.authRetryAt=0;
  }
  private async session(signal?:AbortSignal):Promise<string> {
    if (signal?.aborted) throw cancelled();
    if (this.cookie && this.expiresAt>Date.now()+5000) return this.cookie;
    if (Date.now()<this.authRetryAt) throw authFailed();
    if (!this.loginPromise) {
      this.loginPromise=this.login().catch(error=>{
        this.authRetryAt=Date.now()+(error instanceof ServiceError && error.code==='LIBRETV_AUTH_FAILED' ? 60000 : 5000);
        throw error;
      }).finally(()=>{ this.loginPromise=undefined; });
    }
    await waitWithSignal(this.loginPromise,signal);
    return this.cookie;
  }
  private async request<T>(path:string,schema:z.ZodType<T>,init:RequestInit={},signal?:AbortSignal):Promise<T> {
    for (let attempt=0;attempt<2;attempt++) {
      const cookie=await this.session(signal);
      const headers=new Headers(init.headers); headers.set('Cookie',cookie);
      const response=await this.http.send(path,{...init,headers},signal);
      if (response.status===401 && attempt===0) {
        if (this.cookie===cookie) { this.cookie=''; this.expiresAt=0; }
        continue;
      }
      if (response.status===401||response.status===403||response.status===429) {
        // Only invalidate the cookie that this failed request actually used.
        // A delayed rejection of an older cookie must not clear a newer session.
        if (this.cookie===cookie) {this.cookie='';this.expiresAt=0;this.authRetryAt=Date.now()+60000;}
        throw authFailed();
      }
      if (response.status===404 && path.startsWith('/api/detail?')) throw new ServiceError('MOVIE_NOT_FOUND',404,'Movie details are unavailable');
      if (response.status>=500) throw unavailable();
      if (response.status!==200) throw invalidResponse();
      return parse(schema,response.data);
    }
    throw authFailed();
  }
  status(signal?:AbortSignal) { return this.request('/api/status',statusSchema,{},signal); }
  async enabledSources(signal?:AbortSignal):Promise<Source[]> {
    const [status,settings]=await Promise.all([this.status(signal),this.request('/api/source-settings',settingsSchema,{},signal)]);
    if (!status.passwordRequired||!status.verified) throw authFailed();
    const sources=selectEnabledSources(settings,status,this.config.filterAdult);
    if (sources.length>this.config.maxSources) throw new ServiceError('SOURCE_LIMIT_EXCEEDED',503,'Enabled source count exceeds the configured safety limit');
    return sources;
  }
  async checkConnection(signal?:AbortSignal):Promise<void> { await this.enabledSources(signal); }
  async search(query:string,signal?:AbortSignal):Promise<SearchResults> {
    if (signal?.aborted) throw cancelled();
    const sources=await this.enabledSources(signal);
    const batches:Source[][]=[];
    for (let i=0;i<sources.length;i+=50) batches.push(sources.slice(i,i+50));
    const rows:SearchRow[]=[]; const failures:SourceFailure[]=[];
    let successfulBatches=0; let firstError:unknown; let truncated=false; const seenRows=new Set<string>();
    // Limit concurrent batches even when the configured source count is large.
    let next=0;
    const worker=async()=>{
      while(next<batches.length) {
        const batch=batches[next++]; if (!batch) return;
        try {
          const response=await this.request('/api/search',searchSchema,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wd:query,sources:batch,filterAdult:this.config.filterAdult})},signal);
          const byKey=new Map(batch.map(source=>[source.key,source]));
          const batchRows:SearchRow[]=[];
          for (const item of response.list) {
            const source=byKey.get(item.sourceKey);
            if (!source) throw invalidResponse();
            batchRows.push({source,videoId:item.vodId,title:item.name.normalize('NFKC').trim().replace(/\s+/g,' '),
              ...(item.pic ? {cover:item.pic}:{}),...(item.year ? {year:item.year.trim()}:{}),
              ...(item.typeName ? {typeName:item.typeName}:{}),...(item.area ? {area:item.area}:{}),...(item.remarks ? {remarks:item.remarks}:{})});
          }
          for (const row of batchRows) {
            const key=JSON.stringify([row.source.key,row.videoId]);
            if (seenRows.has(key)) continue;
            if (rows.length>=this.config.maxSearchResults) {truncated=true;continue;}
            seenRows.add(key);rows.push(row);
          }
          successfulBatches++;
          for (const failure of response.failures) if (byKey.has(failure.sourceKey)) failures.push({sourceId:failure.sourceKey,code:failure.timedOut?'SOURCE_TIMEOUT':'SOURCE_FAILED'});
        } catch(error) {
          if (signal?.aborted) throw cancelled();
          firstError ??=error;
          failures.push(...batch.map(source=>({sourceId:source.key,code:'BATCH_FAILED' as const})));
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(this.config.upstreamConcurrency,batches.length)},worker));
    if (batches.length && !successfulBatches) throw firstError;
    const failedKeys=new Set(failures.map(item=>item.sourceId));
    if (sources.length && !rows.length && failedKeys.size===sources.length) throw new ServiceError('SEARCH_FAILED',502,'All enabled sources failed to search');
    const seen=new Set<string>();
    const distinct=rows.filter(row=>{ const key=JSON.stringify([row.source.key,row.videoId]); if (seen.has(key)) return false; seen.add(key);return true; });
    distinct.sort((a,b)=>a.title.localeCompare(b.title,'zh-Hans-CN')||a.source.key.localeCompare(b.source.key)||a.videoId.localeCompare(b.videoId));
    return {rows:distinct,failures:failures.sort((a,b)=>a.sourceId.localeCompare(b.sourceId)),sourceCount:sources.length,truncated};
  }
  async detail(rawSource:Source,rawId:string,signal?:AbortSignal) {
    const validId=videoIdSchema.safeParse(rawId);
    const validSource=sourceSchema.safeParse(rawSource);
    if (!validId.success||!validSource.success) throw new ServiceError('INVALID_DETAIL',400,'Invalid movie detail parameters');
    const params=new URLSearchParams({id:validId.data,source:JSON.stringify(validSource.data)});
    return this.request(`/api/detail?${params}`,detailSchema,{},signal);
  }
}
