# Shared API fixtures

Canonical Filecheck REST API response shapes used by both the `@filecheck/node` test suite and
(as a synced copy) the `filecheck-php` test suite, so the two SDKs assert against identical
payloads.

Provenance: hand-built from the response formatters in the `filecheck-api` repo —
`_layers/mixins/nodejs/format.mjs` (`formatJob`/`formatTask`/`formatStep` + result extractors),
`api/jobs/get.mjs` (runs projection), `api/uploads/post.mjs` (presign), and
`jobs/aggregate.mjs` (webhook payload + summary). Update these when the formatters change.

| File | Shape |
|---|---|
| `job.full.json` | `GET /jobs/{id}` 200 — `{ job }`, non-lean (summary + results, full steps, signed artifacts) |
| `job.lean.json` | `POST /jobs` 201 — `{ job }`, lean (no summary/results, truncated steps), status `pending` |
| `job.pending-202.json` | sync submit timeout — `{ pending: true, job }` (lean, status `running`) |
| `job.runs.json` | `GET /jobs/{id}?expand=runs` — `{ id, status, outcome, runs[] }` (no `job` wrapper) |
| `jobs.list.json` | `GET /jobs` — `{ jobs[], nextKey }` |
| `upload.presign.json` | `POST /uploads` — `{ fileRef, upload: { url, fields, method }, maxBytes, expiresIn }` |
| `webhook.job-completed.json` | per-job webhook body — summary spread + `tasks[]`, **no event envelope** |
| `errors/app-*.json` | app-level errors — `{ error: true, message }` |
| `errors/gw-401.json`, `gw-403.json` | API Gateway auth failures — `{ message }` with **no** `error` field |
| `errors/html-502.txt` | non-JSON error body |
