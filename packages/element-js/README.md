# @filecheck/element-js

Typed loader for the [Filecheck](https://filecheck.io) Element — plus every shared Element
TypeScript type. Modeled on `@stripe/stripe-js`: this package is a thin shim; the Element itself
always loads from `https://cdn.filecheck.io/element/v1/filecheck.js` so it can be updated without
npm releases. Zero runtime dependencies, < 3 kB min+gzip.

## Install

```bash
npm install @filecheck/element-js
```

## Quickstart

```ts
import { loadFilecheck } from '@filecheck/element-js';

const fc = await loadFilecheck('pk_your_publishable_key');
if (fc) {
  const intake = fc.elements.create('intake', { workflowId: 'wf_…' });

  intake.on('status', (status) => {
    submitButton.disabled = !status.canProceed; // authoritative submit gate
    jobIdInput.value = status.jobId ?? '';       // verify server-side before fulfilling
  });

  intake.mount('#filecheck-slot');
}
```

`loadFilecheck` injects the CDN script once — concurrent and repeated calls share a single script
tag and the same promise. In non-browser environments (SSR) it resolves `null` (the Stripe.js
convention), so it is safe to call unconditionally in isomorphic code.

## API

### `loadFilecheck(publishableKey, options?)`

Returns `Promise<FilecheckInstance | null>`.

| Option | Type | Description |
|---|---|---|
| `agentId` | `string \| null` | Optional sub-tenant scope, passed to the factory |
| `iframeSrc` | `string` | Staging override for the iframe URL (internal use) |
| `scriptUrl` | `string` | Override the CDN script URL (staging/self-hosted) |
| `loadTimeoutMs` | `number` | Reject if the script hasn't loaded (default 30 000; 0 disables) |

Rejects with a descriptive error on script load failure or timeout; a failed load may be retried
by calling `loadFilecheck` again.

### Elements

```ts
const intake = fc.elements.create('intake', {
  workflowId, jobId, presentation, locale, ui, connector, connectorId, preview,
});
const report = fc.elements.create('report', { jobId, token, canDownload, fileId, data });
```

Instance methods: `mount(selectorOrEl)`, `update(patch)`, `focus()`, `blur()`,
`respondToProof(approved)`, `unmount()`, `on(event, handler)` (returns an unsubscribe function),
`off(event, handler)`; intake additionally has `setConnector(config)` and `applyNow()`.
Instances are single-use — after `unmount()`, create a new element.

Events: `ready`, `status`, `ui`, `facts`, `error`, `proof`, `download` (report),
`fileSelect` (intake list mode), `destroy` — all fully typed via `ElementEventMap`.

## TypeScript notes

- All shared types are exported from the package root: `FilecheckInstance`, `FilecheckStatic`,
  `IntakeElementOptions`, `ReportElementOptions`, `IntakeUi`, `IntakeStatusPayload`,
  `IntakeFacts`, `ElementEventMap`, `ProofPayload`, `ConnectorConfig`, `ReportFileData`, ….
- `window.Filecheck` is typed globally as `FilecheckStatic | undefined` — the CDN global is the
  callable factory **plus** the static `Filecheck.mount(config)` bootstrap helper. Note the CDN
  bundle auto-wires a built-in proof gallery on every intake it creates.
- `update()` is narrowed per element type (`IntakeUpdatePayload` / `ReportUpdatePayload`).

## Example

See [`examples/vanilla-vite`](examples/vanilla-vite) for a runnable Vite app
(`pnpm --filter element-js-vanilla-example dev`, set `VITE_FILECHECK_PK`).

## License

MIT
