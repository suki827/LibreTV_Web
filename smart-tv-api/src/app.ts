import Fastify, { LogController, type FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import type { AppDatabase } from './db/index.js';
import { ServiceError } from './errors.js';
import { LibreTvClient } from './services/libretv-client.js';
import { MovieIds, MOVIE_ID_MAX_LENGTH } from './services/movie-id.js';
import { registerHealth } from './routes/health.js';
import { registerSearch } from './routes/search.js';
import { registerMovies } from './routes/movies.js';

interface Options { config:Config; database:AppDatabase; client?:LibreTvClient; logger?:boolean }
export function buildApp({config,database,client=new LibreTvClient(config),logger=true}:Options) {
  const app=Fastify({
    logger:logger?{level:config.logLevel,redact:{paths:['req.headers.authorization','req.headers.cookie','res.headers["set-cookie"]','password','libretvPassword','apiToken'],remove:true}}:false,
    logController:new LogController({disableRequestLogging:true}),bodyLimit:16*1024,requestTimeout:config.operationTimeoutMs,connectionTimeout:config.operationTimeoutMs,
    routerOptions:{maxParamLength:MOVIE_ID_MAX_LENGTH},
  });
  const expected=createHash('sha256').update(config.apiToken).digest();
  const operations=new Map<FastifyRequest,{controller:AbortController;timer:ReturnType<typeof setTimeout>;timedOut:boolean}>();
  const finish=(request:FastifyRequest)=>{
    const operation=operations.get(request);
    if (operation) {clearTimeout(operation.timer);operations.delete(request);}
  };
  app.addHook('onRequest',async(request,reply)=>{
    const route=request.routeOptions.url;
    if (route?.startsWith('/api/v1/')) {
      const raw=request.headers.authorization;
      const supplied=typeof raw==='string'&&/^Bearer [^\s]{1,512}$/i.test(raw)?raw.slice(7):'';
      const hash=createHash('sha256').update(supplied).digest();
      if (!timingSafeEqual(hash,expected)) return reply.header('WWW-Authenticate','Bearer realm="smart-tv-api"').code(401).send({error:{code:'UNAUTHORIZED',message:'A valid Smart TV bearer token is required'}});
    }
    if (operations.size>=config.maxActiveRequests) return reply.code(503).send({error:{code:'SERVICE_BUSY',message:'Too many active requests'}});
    const controller=new AbortController();
    const operation={controller,timer:setTimeout(()=>{operation.timedOut=true;controller.abort();},config.operationTimeoutMs),timedOut:false};
    operations.set(request,operation);
    const aborted=()=>{controller.abort();finish(request);};
    request.raw.once('aborted',aborted);
    reply.raw.once('close',()=>{if (!reply.raw.writableEnded) aborted();});
  });
  app.addHook('onResponse',async(request,reply)=>{
    finish(request);
    request.log.info({route:request.routeOptions.url??'unmatched',statusCode:reply.statusCode},'request completed');
  });
  app.addHook('onClose',async()=>{
    for(const [request,operation] of operations) {operation.controller.abort();finish(request);}
    database.close();
  });
  app.setErrorHandler((error,request,reply)=>{
    if (operations.get(request)?.timedOut) return reply.code(504).send({error:{code:'REQUEST_TIMEOUT',message:'Request exceeded its time budget'}});
    if (error instanceof ServiceError) return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
    // Do not serialize or log upstream errors, URLs, cookies, payloads or credentials.
    request.log.error({code:'INTERNAL_ERROR'},'request failed');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'Internal server error'}});
  });
  app.setNotFoundHandler((_request,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'Route not found'}}));
  const context={client,ids:new MovieIds(config.apiToken),signal:(request:FastifyRequest)=>operations.get(request)?.controller.signal??AbortSignal.abort()};
  registerHealth(app,context,database);
  registerSearch(app,context);
  registerMovies(app,context);
  return app;
}
