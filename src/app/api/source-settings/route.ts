import { guardRequest } from '@/lib/api-guard';
import { parseSourceSettings } from '@/lib/source-settings';
import { readSourceSettings, writeSourceSettings, SourceSettingsConflict } from '@/lib/source-settings-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 1024 * 1024;
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  try { return json(await readSourceSettings()); }
  catch { return json({ error: '无法读取服务端源配置，请检查数据目录' }, 500); }
}

export async function PUT(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  // Fetch metadata protects same-site requests from a different port too.
  if (req.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '不允许跨站保存配置' }, 403);
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const host = req.headers.get('host') || new URL(req.url).host;
      if (new URL(origin).host !== host) return json({ error: '不允许跨站保存配置' }, 403);
    } catch { return json({ error: '请求来源格式错误' }, 403); }
  }
  if (!req.headers.get('content-type')?.includes('application/json')) return json({ error: '需要 JSON 请求' }, 415);
  let data;
  let revision: number;
  try {
    // Bound streamed bodies too, before accumulating them in memory.
    const reader = req.body?.getReader();
    if (!reader) return json({ error: '缺少配置' }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); return json({ error: '配置文件过大' }, 413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    revision = body.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('版本格式错误');
    data = parseSourceSettings(body.data);
  } catch { return json({ error: '源配置格式错误，未覆盖原有配置' }, 400); }
  try { return json(await writeSourceSettings(revision, data)); }
  catch (error) {
    if (error instanceof SourceSettingsConflict) return json({ error: '其他设备已修改源配置，请刷新后重新修改' }, 409);
    return json({ error: '源配置未保存，请检查服务端数据目录' }, 500);
  }
}
