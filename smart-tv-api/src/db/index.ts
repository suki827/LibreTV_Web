import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { serviceMeta } from './schema.js';

export function openDatabase(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: fileURLToPath(new URL('../../migrations/', import.meta.url)) });
    return {
      sqlite,
      healthy: () => {
        try { return db.select().from(serviceMeta).where(eq(serviceMeta.key, 'schema_version')).get()?.value === '1'; }
        catch { return false; }
      },
      close: () => { if (sqlite.open) sqlite.close(); },
    };
  } catch (error) { sqlite.close(); throw error; }
}
export type AppDatabase = ReturnType<typeof openDatabase>;
