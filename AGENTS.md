# LibreTV Smart TV development rules

- Original project `/Users/huanyan/Documents/Codex/2026-11-07/bang/work/libretv-source` is read-only.
- All development is restricted to this independent `LibreTV-SmartTV-Dev/` clone.
- Smart TV API code belongs in `smart-tv-api/`.
- Do not modify production containers, Compose files, databases, or source/subscription data.
- Do not deploy to production without explicit authorization.
- Add necessary tests for all functionality.
- Never put sensitive configuration into Git, logs, or test reports.
- Check working directory and Git status at the beginning of each task and before editing.
- If an operation might affect the original project, stop and ask the user first.
- Do not automatically push, merge, or rebase.
