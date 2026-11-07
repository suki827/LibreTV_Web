import type { FastifyInstance } from 'fastify';
import type { AppDatabase } from '../db/index.js';
import type { RouteContext } from './context.js';
export function registerHealth(app:FastifyInstance, context:RouteContext, database:AppDatabase) {
  app.get('/health',async(request,reply)=>{
    const databaseReady=database.healthy();
    let libretvReady=false;
    try { await context.client.checkConnection(context.signal(request)); libretvReady=true; } catch { /* Report readiness, never upstream details. */ }
    const ok=databaseReady&&libretvReady;
    return reply.code(ok?200:503).send({status:ok?'ok':'degraded',service:'libretv-smart-tv-api',version:'0.1.0',checks:{libretv:libretvReady?'ok':'unavailable',database:databaseReady?'ok':'unavailable'}});
  });
}
