import { parseSourceSettings, type SourceSettings, type SourceSettingsDocument } from './source-settings';

export type SourceSyncStatus = 'loading' | 'saved' | 'saving' | 'error' | 'conflict';
type Journal = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Options {
  request: (url: string, options?: RequestInit) => Promise<Response>;
  apply: (value: SourceSettings) => void;
  status: (value: SourceSyncStatus, message?: string) => void;
  journal?: Journal;
  journalKey?: string;
}
const OUTBOX_KEY = 'libretv-source-outbox';
const EMPTY: SourceSettings = { customAPIs: [], selectedKeys: [], subscriptions: [], liveSubscriptions: [],
  liveSelectedUrls: [], envKeysSeen: [], liveEnvKeysSeen: [], envSubsSeen: [] };

export interface RecoverableSourceSettings { key: string; serialized: string; document: SourceSettingsDocument }
export function findRecoverableSourceSettings(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>, ownKey: string,
): RecoverableSourceSettings[] {
  const results: RecoverableSourceSettings[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || key === ownKey || (key !== OUTBOX_KEY && !key.startsWith(OUTBOX_KEY + ':'))) continue;
    try {
      const serialized = storage.getItem(key) || 'null';
      if (storage.getItem('libretv-source-recovered:' + key) === serialized) continue;
      const raw = JSON.parse(serialized);
      if (!Number.isSafeInteger(raw?.revision) || raw.revision < 0) continue;
      results.push({ key, serialized, document: { revision: raw.revision, data: parseSourceSettings(raw.data) } });
    } catch { /* Other browser data is never treated as a configuration. */ }
  }
  return results;
}

/** One writer per page, optimistic revisions, durable offline outbox. */
export class SourceSettingsSync {
  private revision = 0;
  private loaded = false;
  private committed = '';
  private pending: SourceSettings | null = null;
  private conflict = false;
  private writing: Promise<void> | null = null;
  constructor(private options: Options) {}
  private get outboxKey() { return this.options.journalKey || OUTBOX_KEY; }

  private journal() {
    if (!this.options.journal) return false;
    try {
      if (this.pending) this.options.journal.setItem(this.outboxKey, JSON.stringify({ revision: this.revision, data: this.pending }));
      else this.options.journal.removeItem(this.outboxKey);
      return true;
    } catch { return false; }
  }
  private async read(): Promise<SourceSettingsDocument> {
    const response = await this.options.request('/api/source-settings', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? '请重新登录后加载源配置' : '无法加载服务端源配置');
    const value = await response.json();
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('服务端配置版本无效');
    return { revision: value.revision, data: value.data === null ? null : parseSourceSettings(value.data) };
  }
  async load(): Promise<void> {
    this.options.status('loading');
    const document = await this.read();
    let outbox: SourceSettingsDocument | null = null;
    try {
      const text = this.options.journal?.getItem(this.outboxKey);
      if (text) {
        const raw = JSON.parse(text);
        if (Number.isSafeInteger(raw.revision)) outbox = { revision: raw.revision, data: parseSourceSettings(raw.data) };
      }
    } catch { /* An invalid browser backup cannot overwrite the server. */ }
    this.revision = document.revision;
    const server = document.data ?? EMPTY;
    this.committed = JSON.stringify(server);
    this.loaded = true;
    if (outbox?.data && JSON.stringify(outbox.data) !== this.committed) {
      this.pending = outbox.data;
      this.conflict = outbox.revision !== document.revision;
      // A conflict must retain its original base revision in the recovery journal.
      if (this.conflict) this.revision = outbox.revision;
      this.options.apply(outbox.data);
      this.options.status(this.conflict ? 'conflict' : 'saving');
    } else {
      this.pending = null;
      this.journal();
      this.options.apply(server);
      this.options.status('saved');
    }
  }
  change(value: SourceSettings): void {
    if (!this.loaded) throw new Error('服务端源配置尚未加载');
    const data = parseSourceSettings(value);
    if (JSON.stringify(data) === this.committed && !this.writing) {
      this.pending = null; this.journal();
      this.options.status(this.conflict ? 'conflict' : 'saved');
      return;
    }
    this.pending = data;
    this.journal();
    this.options.status(this.conflict ? 'conflict' : 'saving');
  }
  async flush(): Promise<void> {
    if (this.writing) return this.writing;
    if (!this.pending || this.conflict) return;
    this.writing = this.writePending();
    try { await this.writing; } finally { this.writing = null; }
  }
  private async writePending(): Promise<void> {
    while (this.pending && !this.conflict) {
      const data = this.pending;
      this.options.status('saving');
      try {
        const body = JSON.stringify({ revision: this.revision, data });
        const response = await this.options.request('/api/source-settings', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body, keepalive: new TextEncoder().encode(body).length < 60_000,
        });
        if (response.status === 409) {
          this.conflict = true; this.options.status('conflict'); return;
        }
        if (!response.ok) throw new Error(response.status === 401 ? '请重新登录后保存源配置' : '源配置未保存到服务器，请重试');
        const document = await response.json() as SourceSettingsDocument;
        this.revision = document.revision;
        this.committed = JSON.stringify(data);
        if (this.pending === data) this.pending = null;
        this.journal();
      } catch (error) {
        this.options.status('error', error instanceof Error ? error.message : '源配置保存失败');
        return;
      }
    }
    this.options.status('saved');
  }
  async refresh(): Promise<void> {
    if (!this.loaded || this.conflict) return;
    if (this.pending) { await this.flush(); return; }
    const revisionAtStart = this.revision;
    const document = await this.read();
    // A local edit made during the GET must never be replaced by its response.
    if (this.pending || this.writing || this.conflict || this.revision !== revisionAtStart) return;
    if (document.revision !== this.revision) {
      this.revision = document.revision;
      const data = document.data ?? EMPTY;
      this.committed = JSON.stringify(data);
      this.options.apply(data);
    }
    this.options.status('saved');
  }
  async replace(value: SourceSettings): Promise<void> {
    const data = parseSourceSettings(value);
    if (!this.loaded) throw new Error('服务端源配置尚未加载');
    this.options.apply(data);
    this.change(data);
    await this.flush();
    if (this.pending || this.conflict || this.committed !== JSON.stringify(data)) {
      throw new Error('源已载入本机，但尚未保存到服务器；请查看保存状态并重试');
    }
  }
  async recover(document: SourceSettingsDocument): Promise<boolean> {
    if (!this.loaded || this.pending || this.writing || this.conflict) throw new Error('请先处理当前未保存的修改');
    if (!Number.isSafeInteger(document.revision) || document.revision < 0) throw new Error('备份版本无效');
    const data = parseSourceSettings(document.data);
    if (JSON.stringify(data) === this.committed) return true;
    this.pending = data;
    this.conflict = document.revision !== this.revision;
    if (this.conflict) this.revision = document.revision;
    this.options.apply(data);
    const journaled = this.journal();
    this.options.status(this.conflict ? 'conflict' : 'saving');
    await this.flush();
    return !this.pending || journaled;
  }
  async useServerVersion(): Promise<void> {
    // A failed fetch must leave the current pending copy and its journal intact.
    const document = await this.read();
    // Preserve the conflict copy for recovery even after the user switches versions.
    if (this.pending) {
      try { this.options.journal?.setItem('libretv-source-conflict-backup', JSON.stringify(this.pending)); } catch {}
    }
    this.pending = null; this.conflict = false; this.journal();
    this.revision = document.revision;
    const data = document.data ?? EMPTY;
    this.committed = JSON.stringify(data);
    this.options.apply(data);
    this.options.status('saved');
  }
}
