import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Source } from '../schemas/libretv.js';
import { videoIdSchema } from '../schemas/libretv.js';
import { ServiceError } from '../errors.js';
export const MOVIE_ID_MAX_LENGTH=4096;
const referenceSchema=z.object({v:z.literal(1),s:z.string().min(1).max(256),m:videoIdSchema,f:z.string().length(43)}).strict();
export function sourceFingerprint(source:Source) {
  return createHash('sha256').update(JSON.stringify([source.url,source.detail??null])).digest('base64url');
}
export class MovieIds {
  private key:Buffer;
  constructor(token:string) { this.key=createHash('sha256').update('smart-tv-movie-id-v1\0'+token).digest(); }
  private signature(payload:string) { return createHmac('sha256',this.key).update(payload).digest(); }
  create(source:Source,videoId:string):string {
    const payload=Buffer.from(JSON.stringify({v:1,s:source.key,m:videoId,f:sourceFingerprint(source)})).toString('base64url');
    return payload+'.'+this.signature(payload).toString('base64url');
  }
  read(id:string) {
    const invalid=()=>new ServiceError('INVALID_MOVIE_ID',400,'Invalid movie ID');
    if (id.length>MOVIE_ID_MAX_LENGTH || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(id)) throw invalid();
    const [payload,signature]=id.split('.');
    if (!payload||!signature) throw invalid();
    const expected=this.signature(payload); const actual=Buffer.from(signature,'base64url');
    if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw invalid();
    try {
      const ref=referenceSchema.parse(JSON.parse(Buffer.from(payload,'base64url').toString('utf8')));
      return {sourceId:ref.s,videoId:ref.m,fingerprint:ref.f};
    } catch { throw invalid(); }
  }
}
