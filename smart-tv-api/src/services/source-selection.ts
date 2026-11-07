import type { Settings, SiteStatus, Source } from '../schemas/libretv.js';

// Same pure hash and delimiter predicate as customized src/lib/store.ts.
// Browser store itself imports Zustand/Dexie and must not run in this service.
export function subKeyPrefix(url: string): string {
  let hash=5381;
  for (let i=0;i<url.length;i++) hash=((hash<<5)+hash+url.charCodeAt(i))>>>0;
  return `sub_${hash.toString(36)}`;
}
export function selectEnabledSources(settings: Settings, status: SiteStatus, filterAdult: boolean): Source[] {
  const data=settings.data;
  const custom=new Map((data?.customAPIs ?? []).map(source=>[source.key,source]));
  const defaults=new Map(status.defaultSources.map(source=>[source.key,source]));
  const selected=new Set(data?.selectedKeys ?? []);
  const seen=new Set(data?.envKeysSeen ?? []);
  for (const source of status.defaultSources) if (!seen.has(source.key)) selected.add(source.key);
  const disabled=(data?.subscriptions ?? []).filter(s=>s.enabled===false).map(s=>subKeyPrefix(s.url));
  const result:Source[]=[];
  for (const key of selected) {
    const source=custom.get(key) ?? defaults.get(key);
    if (!source || (filterAdult && source.isAdult) || disabled.some(prefix=>key===prefix||key.startsWith(prefix+'_'))) continue;
    result.push(source);
  }
  return result;
}
