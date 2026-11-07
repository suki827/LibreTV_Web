import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';

const env = { LIBRETV_URL: 'http://libretv:8080', LIBRETV_PASSWORD: 'synthetic-password', SMART_TV_API_TOKEN: 'synthetic-tv-token-at-least-32-characters' };

describe('configuration', () => {
  it('requires independent credentials and validates bounded resource configuration', () => {
    expect(() => loadConfig({})).toThrow();
    expect(() => loadConfig({ ...env, LIBRETV_URL: 'file:///etc/passwd' })).toThrow();
    expect(() => loadConfig({ ...env, LIBRETV_URL: 'http://user:secret@libretv:8080' })).toThrow();
    expect(() => loadConfig({ ...env, LIBRETV_URL: 'http://libretv:8080/path' })).toThrow();
    expect(() => loadConfig({ ...env, SMART_TV_API_TOKEN: 'short' })).toThrow();
    expect(() => loadConfig({ ...env, UPSTREAM_CONCURRENCY: '99' })).toThrow();
    expect(() => loadConfig({ ...env, FILTER_ADULT: 'nope' })).toThrow();
    const config = loadConfig(env);
    expect(config.port).toBe(8081);
    expect(config.upstreamConcurrency).toBe(2);
    expect(config.libretvUrl).toBe('http://libretv:8080');
    expect(config.filterAdult).toBe(true);
  });
  it('never includes a rejected secret in configuration errors', () => {
    const secret = 'private-password-must-not-appear';
    try { loadConfig({ ...env, LIBRETV_URL: 'http://user:' + secret + '@host' }); }
    catch (error) { expect(String(error)).not.toContain(secret); }
  });
});

describe('independent SQLite foundation', () => {
  it('migrates an isolated WAL database, reopens safely, and queries through Drizzle', () => {
    const directory = mkdtempSync(join(tmpdir(), 'smart-tv-db-'));
    const filename = join(directory, 'test.sqlite');
    try {
      const first = openDatabase(filename);
      expect(first.healthy()).toBe(true);
      expect(first.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(first.sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 1 });
      first.close();
      expect(first.healthy()).toBe(false);
      const second = openDatabase(filename);
      expect(second.healthy()).toBe(true);
      expect(second.sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 1 });
      second.close();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
