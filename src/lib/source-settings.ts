import type { SourceConfig } from './types';
import type { LiveSubscription, SourceSubscription } from './store';

/** Shared across devices; history, favorites, health caches and preferences stay local. */
export interface SourceSettings {
  customAPIs: SourceConfig[];
  selectedKeys: string[];
  subscriptions: SourceSubscription[];
  liveSubscriptions: LiveSubscription[];
  liveSelectedUrls: string[];
  envKeysSeen: string[];
  liveEnvKeysSeen: string[];
  envSubsSeen: string[];
}
export interface SourceSettingsDocument { revision: number; data: SourceSettings | null }
export const SOURCE_SETTINGS_KEYS = [
  'customAPIs', 'selectedKeys', 'subscriptions', 'liveSubscriptions',
  'liveSelectedUrls', 'envKeysSeen', 'liveEnvKeysSeen', 'envSubsSeen',
] as const;

export function pickSourceSettings(state: SourceSettings): SourceSettings {
  return Object.fromEntries(SOURCE_SETTINGS_KEYS.map(key => [key, state[key]])) as unknown as SourceSettings;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('源配置格式错误');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('源配置字符串格式错误');
  return value;
}
function url(value: unknown): string {
  const result = text(value);
  if (!['http:', 'https:'].includes(new URL(result).protocol)) throw new Error('源地址必须为 HTTP 或 HTTPS');
  return result;
}
function strings(value: unknown): string[] { return array(value).map(text); }
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('源配置列表格式错误或条目过多');
  return value;
}
function optionalFields(value: Record<string, unknown>, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, text(value[key])]));
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('源配置时间格式错误');
  return value;
}

/** Validate and explicitly whitelist every persisted field. */
export function parseSourceSettings(value: unknown): SourceSettings {
  const s = object(value);
  return {
    customAPIs: array(s.customAPIs).map(item => {
      const v = object(item);
      if (v.isAdult !== undefined && typeof v.isAdult !== 'boolean') throw new Error('源分类格式错误');
      return { key: text(v.key), name: text(v.name), url: url(v.url),
        ...(v.detail !== undefined ? { detail: url(v.detail) } : {}),
        ...(v.isAdult !== undefined ? { isAdult: v.isAdult as boolean } : {}) };
    }),
    selectedKeys: strings(s.selectedKeys),
    subscriptions: array(s.subscriptions).map(item => {
      const v = object(item);
      if (v.enabled !== undefined && typeof v.enabled !== 'boolean') throw new Error('订阅开关格式错误');
      if (v.lastStatus !== undefined && v.lastStatus !== 'ok' && v.lastStatus !== 'error') throw new Error('订阅状态格式错误');
      const counts = v.lastCounts === undefined ? undefined : object(v.lastCounts);
      return { url: url(v.url), ...optionalFields(v, ['name', 'lastError']),
        ...(v.enabled !== undefined ? { enabled: v.enabled as boolean } : {}),
        ...(v.lastSync !== undefined ? { lastSync: timestamp(v.lastSync) } : {}),
        ...(v.lastStatus !== undefined ? { lastStatus: v.lastStatus as 'ok' | 'error' } : {}),
        ...(counts ? { lastCounts: { vod: timestamp(counts.vod), live: timestamp(counts.live) } } : {}) };
    }),
    liveSubscriptions: array(s.liveSubscriptions).map(item => {
      const v = object(item);
      return { url: url(v.url), ...optionalFields(v, ['name']),
        ...(v.epg ? { epg: url(v.epg) } : {}),
        ...(v.lastSync !== undefined ? { lastSync: timestamp(v.lastSync) } : {}),
        fromSubscriptions: strings(v.fromSubscriptions) };
    }),
    liveSelectedUrls: strings(s.liveSelectedUrls),
    envKeysSeen: strings(s.envKeysSeen),
    liveEnvKeysSeen: strings(s.liveEnvKeysSeen),
    envSubsSeen: strings(s.envSubsSeen),
  };
}

/** Keep exports from versions predating subscription ownership importable. */
export function parseImportedSourceSettings(value: unknown): SourceSettings {
  const state = object(value);
  const migrated = Object.fromEntries(SOURCE_SETTINGS_KEYS.map(key => [key, state[key] ?? []]));
  migrated.liveSubscriptions = array(migrated.liveSubscriptions).map(item => {
    const live = object(item);
    return { ...live, fromSubscriptions: live.fromSubscriptions ??
      (typeof live.fromSubscription === 'string' && live.fromSubscription ? [live.fromSubscription] : []) };
  });
  return parseSourceSettings(migrated);
}
