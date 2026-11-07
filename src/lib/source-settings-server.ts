import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSourceSettings, type SourceSettings, type SourceSettingsDocument } from './source-settings';

let writer: Promise<unknown> = Promise.resolve();
function directory() { return process.env.SOURCE_SETTINGS_DIR || path.join(process.cwd(), 'data'); }

export async function readSourceSettings(): Promise<SourceSettingsDocument> {
  let raw: string;
  try { raw = await readFile(path.join(directory(), 'sources.json'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: 0, data: null };
    throw error;
  }
  const document = JSON.parse(raw) as SourceSettingsDocument;
  if (!Number.isSafeInteger(document.revision) || document.revision < 1) throw new Error('源配置版本损坏');
  return { revision: document.revision, data: parseSourceSettings(document.data) };
}

export class SourceSettingsConflict extends Error {}

export function writeSourceSettings(revision: number, data: SourceSettings): Promise<SourceSettingsDocument> {
  const operation = writer.then(async () => {
    const current = await readSourceSettings();
    // Retrying after a lost response must not create a conflict or another revision.
    if (JSON.stringify(current.data) === JSON.stringify(data)) return current;
    if (revision !== current.revision) throw new SourceSettingsConflict();
    const document = { revision: current.revision + 1, data };
    const dir = directory();
    await mkdir(dir, { recursive: true });
    const filename = path.join(dir, 'sources.json');
    const temp = path.join(dir, `.sources-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(document, null, 2) + '\n', { mode: 0o600 });
    if (current.data) {
      const backupTemp = path.join(dir, '.sources.previous.tmp');
      await copyFile(filename, backupTemp);
      await rename(backupTemp, path.join(dir, 'sources.previous.json'));
    }
    await rename(temp, filename);
    return document;
  });
  writer = operation.catch(() => {});
  return operation;
}
