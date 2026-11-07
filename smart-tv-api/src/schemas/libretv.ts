import { z } from 'zod';
const httpUrl = z.string().max(8192).url().refine(value => { try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } });
const optionalArtwork = z.preprocess(value => httpUrl.safeParse(value).success ? value : undefined, httpUrl.optional());
export const sourceSchema = z.object({ key: z.string().min(1).max(256), name: z.string().min(1).max(8192), url: httpUrl, detail: httpUrl.optional(), isAdult: z.boolean().optional() });
export type Source = z.infer<typeof sourceSchema>;
export const statusSchema = z.object({ passwordRequired:z.boolean(), verified:z.boolean(), version:z.string(), defaultSources:z.array(sourceSchema).max(5000) });
export const settingsSchema = z.object({ revision:z.number().int().nonnegative(), data:z.object({
  customAPIs:z.array(sourceSchema).max(5000), selectedKeys:z.array(z.string()).max(5000),
  subscriptions:z.array(z.object({ url:httpUrl, enabled:z.boolean().optional() })).max(5000),
  envKeysSeen:z.array(z.string()).max(5000),
}).nullable() });
export type Settings = z.infer<typeof settingsSchema>;
export type SiteStatus = z.infer<typeof statusSchema>;
export const videoIdSchema = z.string().min(1).max(128).regex(/^[\w-]+$/);
export const searchSchema = z.object({
  list:z.array(z.object({ sourceKey:z.string(),vodId:videoIdSchema,name:z.string().min(1).max(8192),pic:optionalArtwork,typeName:z.string().optional(),year:z.string().optional(),area:z.string().optional(),remarks:z.string().optional() })).max(10000),
  failures:z.array(z.object({ sourceKey:z.string(), timedOut:z.boolean().optional() })).max(5000),
});
export const detailSchema = z.object({ episodes:z.array(httpUrl).max(10000), videoInfo:z.object({ title:z.string().optional(), cover:optionalArtwork, desc:z.string().optional(),typeName:z.string().optional(),year:z.string().optional(),area:z.string().optional(),director:z.string().optional(),actor:z.string().optional(),remarks:z.string().optional() }) });
