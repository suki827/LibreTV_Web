# API v0.1 — phase one

All responses are JSON. Error shape: `{"error":{"code":"...","message":"..."}}`. Responses containing source-derived metadata require `Authorization: Bearer <SMART_TV_API_TOKEN>`.

## GET /health

No TV token needed. Real readiness checks. 200: `{"status":"ok","service":"libretv-smart-tv-api","version":"0.1.0","checks":{"libretv":"ok","database":"ok"}}`. Dependency failure returns 503 with `status: degraded` and the failed check `unavailable`. No credentials, database paths or upstream addresses are returned.

## GET /api/v1/search?q=流浪

Only `q` is accepted, trimmed, 1–100 characters. This calls the current LibreTV aggregator; no index or cross-source grouping yet.

```json
{
  "query": "流浪",
  "source_count": 2,
  "partial": false,
  "truncated": false,
  "items": [{"id":"<opaque-signed-id>","title":"流浪地球","year":"2019","type":"科幻片","cover":null,"area":null,"remarks":null,"source":{"id":"custom_0","name":"Example"}}],
  "failures": []
}
```

Nullable metadata remains null when unavailable. Search results from different sources have different IDs. A successful empty search or no enabled sources returns 200 and `items: []`. Partial source/batch failures return 200 with `partial: true`, `failures: [{source_id,code}]`; codes are `SOURCE_FAILED`, `SOURCE_TIMEOUT`, `BATCH_FAILED`. If all selected sources fail, return 502 `SEARCH_FAILED`. A fully unavailable/incompatible backend is a 503/502 error, not an empty successful search.

## GET /api/v1/movies/:id

Use an exact ID returned by search. The adapter rechecks current source enablement and URL binding before fetching details.

```json
{
  "id":"<opaque-signed-id>","title":"Example","year":"2019","type":"电影","cover":null,"description":null,
  "source":{"id":"custom_0","name":"Example"},
  "episodes":[{"number":1,"url":"https://media.example/episode1.m3u8"}]
}
```

Description may contain upstream HTML; render as text or sanitize before use. URL is the chosen upstream line and may expire or require playback headers; this is not an automatic `play` response. Episode numbers reflect array positions, not verified semantic episode labels.

## Status/error codes

- 400 `INVALID_QUERY`, `INVALID_MOVIE_ID`, `INVALID_DETAIL`: bad input/tampered ID.
- 401 `UNAUTHORIZED`: missing/incorrect TV bearer token; no upstream calls.
- 404 `MOVIE_NOT_FOUND`: disabled/changed/missing source or unavailable detail; search again.
- 502 `LIBRETV_INVALID_RESPONSE`, `LIBRETV_RESPONSE_TOO_LARGE`, `LIBRETV_REDIRECT`, `SEARCH_FAILED`: incompatible/upstream response or all failed.
- 503 `LIBRETV_UNAVAILABLE`, `LIBRETV_AUTH_FAILED`, `SOURCE_LIMIT_EXCEEDED`, `UPSTREAM_BUSY`, `SERVICE_BUSY`: retry with backoff; check configuration/backend.
- 504 `LIBRETV_TIMEOUT`, `REQUEST_TIMEOUT`: request exceeded its time budget.
- 499 `REQUEST_CANCELLED`: caller aborted (usually no response can be delivered).

No `POST /api/v1/playback/report`, `/api/v1/play/:id`, or source management endpoints exist in phase one.
