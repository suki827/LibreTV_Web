import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceError } from '../errors.js';
import type { RouteContext } from './context.js';
const querySchema=z.object({q:z.string().trim().min(1).max(100)}).strict();
export function registerSearch(app:FastifyInstance,context:RouteContext) {
  app.get('/api/v1/search',async request=>{
    const parsed=querySchema.safeParse(request.query);
    if (!parsed.success) throw new ServiceError('INVALID_QUERY',400,'Provide only q, containing 1 to 100 characters');
    const result=await context.client.search(parsed.data.q,context.signal(request));
    return {
      query:parsed.data.q,truncated:result.truncated,source_count:result.sourceCount,partial:result.failures.length>0,
      items:result.rows.map(item=>({id:context.ids.create(item.source,item.videoId),title:item.title,year:item.year??null,type:item.typeName??null,cover:item.cover??null,area:item.area??null,remarks:item.remarks??null,source:{id:item.source.key,name:item.source.name}})),
      failures:result.failures.map(failure=>({source_id:failure.sourceId,code:failure.code})),
    };
  });
}
