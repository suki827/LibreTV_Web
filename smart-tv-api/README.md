# LibreTV Smart TV API — phase-one foundation

Standalone read-only API for the verified **LibreTV 2.19.2 customized server-sources** snapshot. Runs in its own Node 24 LTS process; production LibreTV is unchanged.

Implemented: dependency-checked `/health`, enabled-source retrieval, basic keyword search, and source-specific movie details. The public readiness endpoint requires no TV token; `/api/v1/*` requires an independent Bearer token. Upstream credentials and session cookies are kept in process memory, never in SQLite or API responses.

Not implemented in this phase: cross-source movie aggregation; full-library fuzzy search; traditional/simplified conversion, pinyin and alias matching; automatic playback selection/probing; fallback routes; playback reports; persisted movie/search caches. The database currently contains only migration metadata for real readiness checks.

## Develop and verify

Use **Node 24.x** (the lockfile and native SQLite addon must be installed with the same Node major):

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
```

Tests use synthetic network responses and isolated SQLite databases, never third-party video sources or production data. The smoke test starts two local ephemeral ports, authenticates over real HTTP and checks the complete read-only flow. It closes both servers afterwards.

For manual development, create a private `.env` from `.env.example`, change the placeholder credentials and point it at a separately started development LibreTV. Run `node --env-file=.env --import tsx src/server.ts` or export variables before `npm run dev`. `npm run dev/start` does not implicitly load `.env`. Default binding is loopback; no production configuration is supplied.

## Docker (configuration only; not deployed)

```sh
docker build --platform linux/arm64 -t libretv-smart-tv-api:0.1.0-dev .
docker compose --env-file .env config --quiet
# Start only after choosing an authorized development network/backend:
# docker compose --env-file .env up -d --no-build
```

The image uses multi-stage builds, non-root Node, a persistent **independent** named SQLite volume, restart policy, health check and a 384 MiB memory limit. ARM64 native SQLite is installed inside the target-platform builder. No production source directory or database is mounted.

Compose joins an *existing* external network. Verified production network is `libretv_default`, alias `libretv`, port `8080`, but this configuration has **not** been run against it. For isolated testing use your own network and alias, setting `LIBRETV_NETWORK` and `LIBRETV_URL`. Inside a container, `localhost` is that container, not the Raspberry Pi or LibreTV. The Compose file does not create, alter or restart LibreTV.

Host port defaults to `127.0.0.1:8081`; Android TV access later requires an explicitly chosen LAN bind address and access controls. Do not expose a real TV bearer token over an untrusted plain-HTTP network; terminate TLS outside this service as appropriate.

## Operational behavior

- `/health` checks SQLite through Drizzle and authenticated access to shared sources. Returns 503 if either dependency is unavailable.
- Session login is single-flight, Cookie is reused in memory; one 401 refresh/retry only. Redirects are rejected, so credentials never follow another origin.
- Every search reloads source settings. Selection includes explicit selected keys and unseen environment defaults; an explicitly disabled subscription excludes its sources. Browser-local source-health bans cannot be read through the shared API and are not treated as shared health state.
- All enabled sources are searched in batches of at most 50 (LibreTV's per-request limit), under one global upstream concurrency gate (default 2). An excessive source count fails explicitly instead of silently skipping sources.
- At most 1000 unique results are retained by default; `truncated: true` signals omitted rows. Results stay per-source and are deduplicated only by `(source key, video ID)`.
- Queries are trimmed and results have normalized whitespace; only existing upstream search results are matched. This is not full-library fuzzy search.
- IDs are HMAC-signed opaque references bound to source key, upstream ID, API URL and optional detail URL. They survive restart with the same TV token, but source removal/disablement/address change makes old IDs return 404. Token rotation invalidates IDs. This format is phase-one, not yet a durable aggregate movie catalog ID.
- Detail episodes are sequential **index-based** entries from LibreTV's chosen line. Original labels, special episodes and other lines are not available in this upstream response. Do not infer semantic episode alignment between sources or playback compatibility.
- All upstream calls are bounded by timeout, response bytes and queue size; no request-supplied source URLs are accepted. This phase never fetches media URLs, proxies streams, or runs video probes.
- Logs contain route templates, request IDs and status only. Upstream error bodies, source URLs, query strings, bearer tokens and cookies are not logged.

See [API reference](docs/api.md), [LibreTV adaptation](docs/libretv-adapter.md), and [Android TV integration](docs/android-tv.md).
