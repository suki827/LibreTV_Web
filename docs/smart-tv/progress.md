# SDD ledger — plan: docs/superpowers/plans/2026-11-08-smart-tv-api-foundation.md

Baseline: independent clone from upstream dd1c744 plus exact customized source snapshot; original manifest in original-source-manifest.json. Server source/critical-build aggregate SHA256 e651f07e9e640828b659272957fc01008e9997ab58517df3b64aa39d76f451b5 matched 148 files during read-only inspection.
Scope: user explicitly approved phase-one plan, superseding full implementation for now. Inline execution; no production deployment.
Pre-flight: task 1 provides config/database; task 2 consumes config; task 3 consumes adapter and database. Shared source HTTP schema has no browser health state. No interface conflicts.
Decision: Node 24 LTS available in bundled runtime; standalone service targets Node 24. Health includes actual SQLite/Drizzle query; movie/search caches deferred.
