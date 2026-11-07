import type { FastifyInstance } from 'fastify';
import { ServiceError } from '../errors.js';
import { sourceFingerprint } from '../services/movie-id.js';
import type { RouteContext } from './context.js';
export function registerMovies(app:FastifyInstance,context:RouteContext) {
  app.get<{Params:{id:string}}>('/api/v1/movies/:id',async request=>{
    const ref=context.ids.read(request.params.id);
    const sources=await context.client.enabledSources(context.signal(request));
    const source=sources.find(item=>item.key===ref.sourceId&&sourceFingerprint(item)===ref.fingerprint);
    if (!source) throw new ServiceError('MOVIE_NOT_FOUND',404,'The movie source is no longer enabled or has changed');
    const detail=await context.client.detail(source,ref.videoId,context.signal(request));
    return {id:request.params.id,title:detail.videoInfo.title??null,year:detail.videoInfo.year??null,type:detail.videoInfo.typeName??null,cover:detail.videoInfo.cover??null,description:detail.videoInfo.desc??null,
      source:{id:source.key,name:source.name},
      episodes:detail.episodes.map((url,index)=>({number:index+1,url})),
    };
  });
}
