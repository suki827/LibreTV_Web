# LibreTV_Web development and branch rules

- Original project `/Users/huanyan/Documents/Codex/2026-11-07/bang/work/libretv-source` is read-only.
- All development is restricted to this independent `LibreTV-SmartTV-Dev/` clone.
- Smart TV API code belongs in `smart-tv-api/`.
- Do not modify production containers, Compose files, databases, or source/subscription data.
- Do not deploy to production without explicit authorization.
- Add necessary tests for all functionality.
- Never put sensitive configuration into Git, logs, or test reports.
- Check working directory and Git status at the beginning of each task and before editing.
- If an operation might affect the original project, stop and ask the user first.
- `main` is reserved for official `LibreSpark/LibreTV` synchronization, not personal development. Existing personal history is preserved until the owner approves a separate alignment plan. Never rewrite or force-push it.
- `deploy/stable` maintains the tested personal deployment baseline, including server-side source settings. New unfinished features must not enter it. Raspberry Pi builds must use this branch or an explicitly approved stable tag; this rule does not change the existing production checkout or Docker configuration.
- Create new `feature/*` branches from `deploy/stable`. Existing `feature/smart-tv-api` preserves the API work and its original commits; complete and test it before a PR targeting `deploy/stable`.
- Do not develop personal features directly on `main`, or untested features directly on `deploy/stable`.
- Official updates: fetch `upstream`, assess changes, then test on an `integration/*` branch from `deploy/stable`. Stop on ambiguous business logic conflicts; request owner guidance. Never merge official updates directly into stable.
- Preserve existing branches, commits, and uncommitted/untracked files. Report dirty state before making changes; never clean it without approval. Never use hard reset, force push, or branch deletion.
- Before any main alignment, create a dated `backup/*` branch and verify all personal commits remain reachable. An existing target branch must be inspected and retained, never overwritten or recreated.
- No push or PR without explicit owner approval. During the 2026-11-08 branch reorganization, all changes are local only and no PR is allowed.
- Follow `docs/branch-workflow.md` for development, verification, official integration, deployment and rollback.
