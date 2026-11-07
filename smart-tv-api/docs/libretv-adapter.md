# Verified customized LibreTV adaptation

Source snapshot: upstream commit `dd1c744c40d60ee553bd9f7eb3df55dd79a8f7dc` plus preserved uncommitted server-source-storage changes. Runtime `libretv:2.19.2-server-sources-20261107`. Verified source path `/mnt/data/server/compose/libreTv/server-sources-20261107/source` is a plain source export without Git metadata. 148 source/key-build files matched local snapshot SHA256 `e651f07e9e640828b659272957fc01008e9997ab58517df3b64aa39d76f451b5` during read-only inspection. The independent clone preserves upstream history and commits the customized baseline locally. No production credentials, cookies, private source lists or databases were copied.

| Existing HTTP contract | Adapter usage |
|---|---|
| POST `/api/auth` `{password}` | Login; accept only `ltv_session` Set-Cookie; never persist it |
| GET `/api/status` | `passwordRequired`, `verified`, `version`, `defaultSources`; defaults are not saved custom sources |
| GET `/api/source-settings` | `{revision,data}`; uses customAPIs, selectedKeys, subscriptions, envKeysSeen |
| POST `/api/search` `{wd,sources,filterAdult}` | Non-stream JSON `{list,failures}`, max 50 sources per call |
| GET `/api/detail?id=...&source=<encoded JSON>` | `{episodes:string[],videoInfo}`; current upstream IDs restricted to word/hyphen characters |

The source-selection adapter faithfully reproduces `subKeyPrefix` (djb2 uint32 base36) and exact/underscore-delimited subscription ownership from `src/lib/store.ts`. Importing that module directly would load browser-only Zustand/Dexie. The independent Zod schemas validate only the HTTP fields consumed; extra upstream fields are discarded. This is a compatibility adapter, not another subscription management system.

Shared source JSON lives at `/mnt/data/server/appdata/libretv/sources.json` (mounted `/app/data`); this API never opens it or sends PUT to it. No management/refetch of remote subscription lists is implemented. Browser-local `sourceHealth` and preference `yellowFilter` are not shared; this service has its own explicit `FILTER_ADULT` configuration. All selected source lists are request-local and reloaded; sources disabled between search/detail stop being usable immediately.

Existing pure CMS/M3U8 functions remain in LibreTV; they execute there through HTTP rather than being copied into a second parser. The detail contract already selects one line (preferring M3U8) and discards the original episode labels/other lines. Reliable cross-source episode alignment, aliases and season/series grouping require later adapter/index work; do not equate URL array indices across sources.

Network boundaries: only an administrator-configured fixed LibreTV origin is contacted; local/Docker private addresses are required for that trusted connection. Redirects are rejected. The public API cannot supply sources or upstream URLs. Media URLs in returned details are *not fetched by this service*. Future media probing will need its own hardened SSRF policy including DNS/IP pinning, all reserved ranges and every redirected manifest/segment/key URL; existing LibreTV SSRF helpers must be evaluated before reuse.
