'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import { pickSourceSettings, type SourceSettings } from '@/lib/source-settings';
import { findRecoverableSourceSettings, SourceSettingsSync, type RecoverableSourceSettings, type SourceSyncStatus } from '@/lib/source-settings-sync';
import { api } from '@/lib/client-api';
import { applyEnvPresets } from '@/lib/subscription-sync';

let activeSync: SourceSettingsSync | null = null;
// Runtime ownership is unique even when Chrome duplicates a tab's sessionStorage.
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const journalKey = `libretv-source-outbox:${clientId}`;

/** Complete the shared write before importing local preferences and reloading. */
export async function importSharedSources(value: SourceSettings): Promise<void> {
  if (!activeSync) throw new Error('请先登录并等待源配置加载完成');
  await activeSync.replace(value);
}

export function ServerSourceSettings({ children }: { children: ReactNode }) {
  const { verified, openLogin } = useAuth();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SourceSyncStatus>('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [recoverable, setRecoverable] = useState<RecoverableSourceSettings[]>([]);
  const syncRef = useRef<SourceSettingsSync | null>(null);

  useEffect(() => {
    if (!verified) { setReady(false); return; }
    let cancelled = false;
    let applying = false;
    let previous = '';
    let unsubscribe: (() => void) | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    setReady(false);
    setStatus('loading');
    let journal: Storage | undefined;
    try { journal = window.localStorage; } catch {}
    const sync = new SourceSettingsSync({
      request: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
      journal,
      journalKey,
      apply: (data) => {
        if (cancelled) return;
        applying = true;
        useAppStore.setState(data);
        previous = JSON.stringify(pickSourceSettings(useAppStore.getState()));
        applying = false;
      },
      status: (value, text) => {
        if (!cancelled) { setStatus(value); setMessage(text || ''); }
      },
    });
    syncRef.current = sync;
    const refresh = () => { void sync.refresh().catch(() => {}); };
    const save = () => { void sync.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') save(); else refresh(); };
    const initialize = async () => {
      if (!useAppStore.persist.hasHydrated()) await useAppStore.persist.rehydrate();
      await sync.load();
      if (cancelled) return;
      if (journal) setRecoverable(findRecoverableSourceSettings(journal, journalKey));
      activeSync = sync;
      previous = JSON.stringify(pickSourceSettings(useAppStore.getState()));
      unsubscribe = useAppStore.subscribe(state => {
        if (applying) return;
        const data = pickSourceSettings(state);
        const serialized = JSON.stringify(data);
        if (serialized === previous) return;
        previous = serialized;
        try { sync.change(data); }
        catch { setStatus('error'); setMessage('源配置格式错误，请检查刚才的修改'); return; }
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 500);
      });
      const siteStatus = await api.status();
      if (cancelled) return;
      await applyEnvPresets(siteStatus);
      if (cancelled) return;
      setReady(true);
      await sync.flush();
      pollTimer = setInterval(refresh, 10_000);
      window.addEventListener('focus', refresh);
      window.addEventListener('online', refresh);
      window.addEventListener('pagehide', save);
      document.addEventListener('visibilitychange', onVisibility);
    };
    void initialize().catch(() => {
      if (!cancelled) { setStatus('error'); setMessage('无法加载服务端源配置，请检查网络后重试'); }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (activeSync === sync) activeSync = null;
      if (saveTimer) clearTimeout(saveTimer);
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
      void sync.flush();
    };
  }, [verified, attempt]);

  return <>
    {children}
    {verified && !ready && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80">
      <div className="bg-surface-raised rounded-xl p-6 mx-4 text-content" role="status">
        <p>{status === 'error' ? message : '正在加载服务端源配置…'}</p>
        {status === 'error' && <div className="flex gap-3 mt-4">
          <button className="btn-primary" onClick={() => setAttempt(v => v + 1)}>重试</button>
          <button className="btn-ghost" onClick={openLogin}>重新登录</button>
        </div>}
      </div>
    </div>}
    {verified && ready && <div className={`fixed bottom-3 left-3 z-[94] max-w-[calc(100vw-1.5rem)] rounded-lg px-3 py-2 text-xs shadow-lg bg-surface-raised ${status === 'error' || status === 'conflict' ? 'text-danger' : 'text-muted'}`} role="status" aria-live="polite">
      {status === 'saved' && '源配置已保存到服务器'}
      {status === 'saving' && '正在保存源配置…'}
      {status === 'error' && <>{message || '源配置尚未保存，请检查网络'} <button className="underline ml-2" onClick={() => { void syncRef.current?.flush(); }}>重试保存</button> <button className="underline ml-2" onClick={openLogin}>重新登录</button></>}
      {status === 'conflict' && <>其他设备已修改源配置，本机修改尚未保存。可先导出配置备份。<button className="underline ml-2" onClick={() => { void syncRef.current?.useServerVersion().catch(() => setMessage('加载失败，请重试')); }}>使用服务器配置</button></>}
      {status === 'saved' && recoverable.length > 0 && <div className="mt-2 text-warning">
        此浏览器还有其他页面留下的待保存源配置：
        {recoverable.map(item => <button key={item.key} className="underline ml-2" onClick={() => {
          void syncRef.current?.recover(item.document).then(copied => {
            // Never delete another page's journal: it may already contain a newer edit.
            // A marker acknowledges only this exact recovered snapshot.
            try {
              if (copied) {
                window.localStorage.setItem('libretv-source-recovered:' + item.key, item.serialized);
                setRecoverable(items => items.filter(value => value.key !== item.key));
              }
            } catch {}
          }).catch(error => setMessage(error instanceof Error ? error.message : '恢复失败'));
        }}>恢复 {item.document.data?.customAPIs.length ?? 0} 点播 / {item.document.data?.liveSubscriptions.length ?? 0} 直播</button>)}
        {message && <p>{message}</p>}
      </div>}
    </div>}
  </>;
}
