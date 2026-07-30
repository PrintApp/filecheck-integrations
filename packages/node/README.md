# @filecheck/node

Filecheck server SDK for Node.js 18+ — jobs, uploads, webhooks, and the server-side job
verification your fulfillment path must run before trusting a browser-submitted `jobId`.

Zero runtime dependencies (built-in `fetch`). ESM + CJS + full TypeScript types.

## Install

```bash
npm install @filecheck/node
```

## Quickstart — verify a job before fulfilling

The browser Element gives the customer a `jobId`; never trust it blind. Verify server-side:

**Express**

```ts
import Filecheck from '@filecheck/node';
const fc = new Filecheck(process.env.FILECHECK_SECRET_KEY);

app.post('/checkout', async (req, res) => {
  const { ok, state, reason } = await fc.jobs.verify(req.body.filecheck_job_id, {
    workflowId: 'wf_…',
  });
  if (!ok) return res.status(422).json({ error: `files not accepted (${reason})` });
  // fulfill the order; state is 'ready' or 'partial' (warnings accepted by policy)
  res.json({ ok: true, state });
});
```

**Next.js (App Router route handler)**

```ts
import Filecheck from '@filecheck/node';
const fc = new Filecheck(process.env.FILECHECK_SECRET_KEY!);

export async function POST(request: Request) {
  const { jobId } = await request.json();
  const { ok, reason } = await fc.jobs.verify(jobId, { workflowId: 'wf_…' });
  if (!ok) return Response.json({ error: reason }, { status: 422 });
  return Response.json({ ok: true });
}
```

`verify()` is the encoded docs checklist: the job must be **terminal**
(`status ∈ done|skipped|error`), **proceedable** (the Element's `canProceed` equivalent —
`ready`/`partial` after applying the job's `onFail` policy), and — when you pass `workflowId` —
must have run the expected workflow. Options: `policy` (override the resolved onFail),
`strict` (fail closed on `status: 'error'` jobs).

## Uploading + processing files

```ts
// Two-leg upload (presign + S3) in one call → fileRef
const { fileRef } = await fc.uploads.create(buffer, { mimeType: 'application/pdf', fileName: 'a.pdf' });

// Validate against PDF/X profiles — waits for the result by default
const { job } = await fc.jobs.validate({ sources: [{ fileRef, profile: ['1b'] }] });
console.log(job.results?.validate?.[0]?.compliant);

// Preflight + autofix — async by default; wait: true to block until terminal
const fixed = await fc.jobs.fix({ sources: [{ fileRef, profileId: 'default' }], wait: true });

// Canonical job with an explicit step pipeline (note: no workflowId here —
// workflow-driven jobs are created by the browser Element, not this endpoint)
const created = await fc.jobs.create({
  sources: [{ url: 'https://cdn.example.com/artwork.pdf', steps: [{ type: 'preflight' }] }],
  webhook: { url: 'https://example.com/webhooks/filecheck' },
});
```

### The `wait` option

The raw API inconsistently flips sync/async with `sync: true` (create/preflight/previews/fix —
async default) and `async: true` (validate/optimize — sync default). The SDK normalizes all six
behind `{ wait?, waitTimeoutMs? }` with defaults matching each endpoint. When the server's ~27 s
wait budget expires (HTTP 202), the SDK keeps polling `GET /jobs/{id}` client-side up to
`waitTimeoutMs` (default 120 s; `0` = server-side wait only). Every submit resolves
`{ job, pending }`.

## API surface

| Method | Endpoint |
|---|---|
| `fc.jobs.create(params)` | `POST /jobs` |
| `fc.jobs.preflight/previews/fix/validate/optimize(params)` | `POST /jobs/…` sugar endpoints |
| `fc.jobs.retrieve(id)` | `GET /jobs/{id}` |
| `fc.jobs.retrieveRuns(id)` | `GET /jobs/{id}?expand=runs` (flattened per-file summary + proof/download URLs) |
| `fc.jobs.list({ limit, nextKey })` / `fc.jobs.iterate()` | `GET /jobs` (+ auto-pagination) |
| `fc.jobs.del(id)` | `DELETE /jobs/{id}` |
| `fc.jobs.waitUntilTerminal(id, opts)` | polling helper |
| `fc.jobs.verify(id, opts)` | fulfillment gate (see above) |
| `fc.uploads.create(file, opts)` | `POST /uploads` + S3 leg → `{ fileRef }` |
| `fc.orders.create(orderId, params)` | `POST /orders/{id}` |
| `fc.workflows/connectors/rules/profiles/optimizePresets.list()/.retrieve(id)` | read-only library |
| `fc.webhooks.constructEvent(rawBody, sig, secret, opts)` | webhook parsing/verification |

Client options: `new Filecheck('sk_…', { baseUrl?, timeoutMs?, maxRetries?, fetch?, transport? })`.
Secret keys are `sk_…`; passing a publishable `pk_…` key throws immediately with an explanation.
Keys are never echoed in full — errors mask to `sk_…abc4`.

## Webhooks

> **Signing status:** Filecheck's per-job `job.completed` webhooks are delivered **unsigned**
> today; the signature scheme is not finalized. `constructEvent` is structured so verification
> becomes the default without breaking changes once it ships. Until then, `{ verify: false }` is
> the explicit, temporary escape hatch.

```ts
app.post('/webhooks/filecheck', express.raw({ type: 'application/json' }), (req, res) => {
  const event = fc.webhooks.constructEvent(req.body, req.get('x-filecheck-signature'), null, {
    verify: false, // TEMPORARY until Filecheck ships webhook signing
  });
  if (event.type === 'job.completed') {
    // event.payload: { id, status, outcome, taskIds, tasks[], finalized, … }
  }
  res.sendStatus(200);
});
```

Always hand `constructEvent` the **raw** body (`express.raw`, `await request.text()`), never a
re-parsed object — signature verification depends on the exact bytes.

## Errors & retries

Typed errors: `AuthenticationError` (401/403 — including API Gateway's bare
`{"message":"Forbidden"}` shape), `InvalidRequestError` (400), `NotFoundError` (404),
`RateLimitError` (429), `APIError` (5xx / non-JSON bodies), `ConnectionError` (network/timeout),
`WebhookSignatureError`. The API has no machine-readable error codes — branch on error class, not
message text.

Retries: idempotent GETs are retried (default 2×, full-jitter backoff, `Retry-After` honored) on
429/502/503/504 and network failures. **POSTs are never auto-retried** — the API has no
idempotency keys, and a duplicated `POST /jobs` creates and bills a second job. If you need
create-retry semantics, tag sources with `clientRef`/`metaData` and reconcile via `jobs.list()`.

## License

MIT
