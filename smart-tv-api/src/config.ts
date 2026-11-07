import { z } from 'zod';

const integer = (min: number, max: number, value: number) => z.coerce.number().int().min(min).max(max).default(value);
const environment = z.object({
  LIBRETV_URL: z.string().url().refine(value => {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === '/';
  }),
  LIBRETV_PASSWORD: z.string().min(1).max(4096),
  SMART_TV_API_TOKEN: z.string().min(32).max(512),
  HOST: z.string().default('127.0.0.1'),
  PORT: integer(1, 65535, 8081),
  DATABASE_PATH: z.string().min(1).default('data/smart-tv.sqlite'),
  UPSTREAM_TIMEOUT_MS: integer(50, 60000, 12000),
  OPERATION_TIMEOUT_MS: integer(100, 120000, 30000),
  UPSTREAM_CONCURRENCY: integer(1, 8, 2),
  MAX_RESPONSE_BYTES: integer(1024, 8 * 1024 * 1024, 2 * 1024 * 1024),
  MAX_SEARCH_RESULTS: integer(1, 10000, 1000),
  MAX_SOURCES: integer(1, 1000, 500),
  MAX_ACTIVE_REQUESTS: integer(1, 64, 8),
  FILTER_ADULT: z.enum(['true', 'false']).default('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
});
export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = environment.safeParse(env);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Invalid configuration fields: ${fields.join(', ')}`);
  }
  const value = parsed.data;
  return {
    libretvUrl: new URL(value.LIBRETV_URL).origin,
    libretvPassword: value.LIBRETV_PASSWORD,
    apiToken: value.SMART_TV_API_TOKEN,
    host: value.HOST, port: value.PORT, databasePath: value.DATABASE_PATH,
    upstreamTimeoutMs: value.UPSTREAM_TIMEOUT_MS, operationTimeoutMs: value.OPERATION_TIMEOUT_MS,
    upstreamConcurrency: value.UPSTREAM_CONCURRENCY, maxResponseBytes: value.MAX_RESPONSE_BYTES,
    maxSources: value.MAX_SOURCES, maxSearchResults: value.MAX_SEARCH_RESULTS, maxActiveRequests: value.MAX_ACTIVE_REQUESTS,
    filterAdult: value.FILTER_ADULT === 'true', logLevel: value.LOG_LEVEL,
  };
}
export type Config = ReturnType<typeof loadConfig>;
