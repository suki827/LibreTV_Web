# Android TV client integration — foundation only

1. Configure the authorized Smart TV API origin and independent bearer token. Never embed the LibreTV server password in the APK.
2. Call `/health` for readiness. This checks authenticated backend access and the separate SQLite connection.
3. Debounce remote-control input; URL-encode `q` in `/api/v1/search`. Send the bearer token in the header, never the URL or logs. Cancel obsolete requests when the query changes.
4. Render title/cover/source from `items`. Keep per-source cards for now; different IDs may refer to the same film. Handle `partial`, `failures` and `truncated` without claiming there are no more results.
5. Pass an unchanged returned ID to `/api/v1/movies/:id`. Cache IDs only temporarily. On 404 search again: source may be disabled/changed. IDs also change when the TV API token is rotated.
6. Episodes are array indices from one line. Do not match specials, trailers, seasons or differing episode counts solely by number. This stage is primarily adapter validation, not the final automatic-line playback contract.
7. Returned URLs may need source-specific headers and may expire. The final automatic selection/probing/feedback APIs are deferred; no client codec guarantee or automatic fallback is provided yet.

Use exponential backoff for 503/504. On 401 check the TV token rather than repeatedly calling LibreTV login. Do not forward the TV bearer token to media hosts; it authenticates only this API. Treat metadata/description as untrusted content. Production distribution requires a suitable authentication/token provisioning and HTTPS strategy; the current phase uses a configured shared TV token for controlled testing.
