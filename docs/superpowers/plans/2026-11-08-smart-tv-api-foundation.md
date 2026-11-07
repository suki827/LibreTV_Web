# Smart TV API Foundation Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans; test first and review the complete change once.

**Goal:** Independent read-only Fastify service: authenticate to customized LibreTV, load enabled sources, search them, fetch source-specific details.
**Architecture:** HTTP adapter to existing Next.js endpoints; never read/write production files directly. SQLite/Drizzle readiness foundation only. Separate TV bearer token. Opaque signed per-source movie IDs bind source configuration and upstream video ID.
**Tech Stack:** Node 24 LTS, strict TypeScript, Fastify, Zod, SQLite, Drizzle ORM, fetch, Vitest, Docker Compose.
**Spec:** docs/smart-tv/requirements.md, narrowed by the user's approval of phase-one foundation/search/detail plan.

## Global Constraints
- Develop only in this independent clone, feature/smart-tv-api. Original project and production are read-only.
- Do not copy real credentials/subscriptions/database, deploy, restart production, push, merge or rebase.
- Read-only upstream calls: GET status/source-settings/detail and POST auth/search; no source-settings PUT.
- Do not claim full-library fuzzy search, aggregation, automatic playback selection, health scoring or caching in this phase.
- Test via synthetic responses and isolated databases. Never depend on third-party video sources.

## Review Focus
- Concurrent expired sessions must not trigger a login storm or overwrite a newer session.
- Disabled subscriptions must exclude their sources; browser-local health cannot be silently treated as shared.
- Detail IDs must not allow arbitrary upstream URLs or return disabled/changed sources.
- Bound upstream body reads, timeouts, redirects, concurrency and error/log exposure.
- Root LibreTV build must remain compatible with nested standalone service files.

### Task 1: baseline, configuration and database
Files: smart-tv-api/package.json, tsconfig*.json, eslint.config.mjs, src/config.ts, src/errors.ts, src/db/*, migrations/*, tests/config-db.test.ts.
Interfaces: loadConfig(env), openDatabase(path) exposing healthy()/close().
- [x] Write failing config/WAL/migration/reopen/closed DB tests, run RED.
- [x] Implement strict config and real SQLite/Drizzle readiness, run GREEN.
- [x] Commit foundation locally; record evidence in docs/smart-tv/progress.md.

### Task 2: read-only LibreTV adapter
Files: src/schemas/libretv.ts, src/services/libretv-client.ts, src/services/source-selection.ts, tests/libretv-client.test.ts.
Interfaces: status(), enabledSources(signal), search(query, signal), detail(source, videoId, signal), checkConnection().
- [x] Write failing synthetic-network tests for actual contracts, source enablement, session reuse/401 recovery, partial failures, all-enabled batching beyond 50, malformed responses, timeouts, redirects and body limits.
- [x] Implement adapter with single-flight auth, bounded transport and safe errors. Reproduce source-prefix predicate from verified original pure helper, without importing browser store.
- [x] Run adapter suite GREEN; commit locally and record results.

### Task 3: routes, contracts, packaging and validation
Files: src/app.ts, src/server.ts, src/routes/{health,search,movies}.ts, src/services/movie-id.ts, tests/app.test.ts, Dockerfile, compose.yaml, .env.example, README.md, docs/*.md.
Interfaces: GET /health; bearer-protected GET /api/v1/search?q=...; GET /api/v1/movies/:id (per source).
- [x] Write failing Fastify.inject tests for complete login→enabled sources→search→detail chain, stable signed IDs, source changes/disablement, auth, validation, cancellation and sanitized errors.
- [x] Implement routes; return episodes as numbered URLs with index-based matching explicitly documented.
- [x] Add isolated ARM64-capable Docker image/Compose, docs and no real configuration.
- [x] Run typecheck, lint, tests and builds for service and original LibreTV in this clone. Attempt local Docker build; report exact blocker if unavailable.
- [x] Independent final review, fix important issues with regression tests, confirm original manifest unchanged. No production operations.
