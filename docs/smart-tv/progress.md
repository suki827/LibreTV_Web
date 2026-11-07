# SDD ledger — plan: docs/superpowers/plans/2026-11-08-smart-tv-api-foundation.md

Baseline: independent clone from upstream dd1c744 plus exact customized source snapshot; original manifest in original-source-manifest.json. Server source/critical-build aggregate SHA256 e651f07e9e640828b659272957fc01008e9997ab58517df3b64aa39d76f451b5 matched 148 files during read-only inspection.
Scope: user explicitly approved phase-one plan, superseding full implementation for now. Inline execution; no production deployment.
Pre-flight: task 1 provides config/database; task 2 consumes config; task 3 consumes adapter and database. Shared source HTTP schema has no browser health state. No interface conflicts.
Decision: Node 24 LTS available in bundled runtime; standalone service targets Node 24. Health includes actual SQLite/Drizzle query; movie/search caches deferred.

Task 1: complete — configuration + independent WAL SQLite/Drizzle migration/reopen tests RED→GREEN (3 cases).
Task 2: complete — actual HTTP contract adapter, global bounded requests, single-flight session and source selection. Adapter suite 16/16 after final regression fixes.
Task 3: API routes complete — full suite 27/27, tsc/ESLint/build pass; real local HTTP smoke and Compose config parse pass. Docker ARM64 build in progress.
Final review: independent reviewer, no production access.
Final: fixed optional artwork compatibility and total URL predicates — optional-artwork regression RED→GREEN.
Final: fixed repeated rejected-fresh-session logins — fresh-session rejection regression RED→GREEN.
Final: fixed valid Unicode/escaped source IDs exceeding router limit — full search/detail regression RED→GREEN, common encoded bound 4096.
Original integrity: all 171 baseline file hashes match; independent Git object store, no alternates.

Task 3: complete — tsc, ESLint, 27/27 service tests, compiled build, real loopback HTTP smoke, Compose configuration validation all pass.
Docker: linux/arm64 image libretv-smart-tv-api:0.1.0-dev built; isolated container smoke passed native SQLite WAL, non-root runtime, compiled API Mock flow with network disabled.
Original clone compatibility: 439/439 tests, typecheck/lint and Next production build pass.
Review fix pass complete; no unresolved review findings. No production connection, deployment, restart, push or merge during this phase. Development branch retained as requested.
