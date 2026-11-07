import type { Config } from '../config.js';
import { ServiceError, invalidResponse, unavailable } from '../errors.js';

export function cancelled() { return new ServiceError('REQUEST_CANCELLED',499,'Request cancelled'); }

class RequestGate {
  private active=0;
  private queue: { start:()=>void; cancel:()=>void }[]=[];
  constructor(private limit:number) {}
  async run<T>(signal:AbortSignal, action:()=>Promise<T>):Promise<T> {
    signal.throwIfAborted();
    if (this.active>=this.limit) {
      if (this.queue.length>=64) throw new ServiceError('UPSTREAM_BUSY',503,'Upstream request queue is full');
      await new Promise<void>((resolve,reject)=>{
        const entry={ start:()=>{ signal.removeEventListener('abort',entry.cancel); this.active++; resolve(); }, cancel:()=>{ this.queue=this.queue.filter(value=>value!==entry); reject(signal.reason); } };
        this.queue.push(entry);
        signal.addEventListener('abort',entry.cancel,{once:true});
      });
    } else this.active++;
    try { signal.throwIfAborted(); return await action(); }
    finally { this.active--; this.queue.shift()?.start(); }
  }
}
async function boundedJson(response:Response, signal:AbortSignal, maxBytes:number):Promise<unknown> {
  if (!/application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('content-type') ?? '')) { void response.body?.cancel(); throw invalidResponse(); }
  const length=Number(response.headers.get('content-length'));
  if (length>maxBytes) { void response.body?.cancel(); throw new ServiceError('LIBRETV_RESPONSE_TOO_LARGE',502,'LibreTV response exceeds the configured size limit'); }
  const reader=response.body?.getReader();
  if (!reader) throw invalidResponse();
  const abort=()=>{ void reader.cancel().catch(()=>{}); };
  signal.addEventListener('abort',abort,{once:true});
  const chunks:Uint8Array[]=[];
  let total=0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const part=await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      total+=part.value.byteLength;
      if (total>maxBytes) { await reader.cancel(); throw new ServiceError('LIBRETV_RESPONSE_TOO_LARGE',502,'LibreTV response exceeds the configured size limit'); }
      chunks.push(part.value);
    }
    const bytes=Buffer.concat(chunks);
    try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw invalidResponse(); }
  } finally { signal.removeEventListener('abort',abort); reader.releaseLock(); }
}
export class LibreTvHttp {
  private gate:RequestGate;
  constructor(private config:Config, private fetchImpl:typeof fetch=fetch) { this.gate=new RequestGate(config.upstreamConcurrency); }
  async send(path:string, init:RequestInit={}, caller?:AbortSignal):Promise<{ status:number; headers:Headers; data:unknown }> {
    const timeout=AbortSignal.timeout(this.config.upstreamTimeoutMs);
    const signal=caller ? AbortSignal.any([caller,timeout]) : timeout;
    try {
      return await this.gate.run(signal,async()=>{
        const response=await this.fetchImpl(new URL(path,this.config.libretvUrl),{ ...init,signal,redirect:'manual' });
        if (response.status>=300 && response.status<400) { void response.body?.cancel(); throw new ServiceError('LIBRETV_REDIRECT',502,'LibreTV redirects are not allowed'); }
        if (!response.ok) { void response.body?.cancel(); return { status:response.status,headers:response.headers,data:null }; }
        return { status:response.status,headers:response.headers,data:await boundedJson(response,signal,this.config.maxResponseBytes) };
      });
    } catch(error) {
      if (caller?.aborted) throw cancelled();
      if (signal.aborted) throw new ServiceError('LIBRETV_TIMEOUT',504,'LibreTV request timed out');
      if (error instanceof ServiceError) throw error;
      throw unavailable();
    }
  }
}
