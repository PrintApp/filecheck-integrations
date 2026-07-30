# filecheck-react

React components and hooks for the [Filecheck](https://filecheck.io) Element. A thin wrapper over
[`filecheck-js`](../element-js) — the Element itself always loads from the Filecheck CDN.

Requires React ≥ 18. All entry points carry `'use client'`, so the package works in the Next.js
App Router with no configuration.

## Install

```bash
npm install filecheck-react filecheck-js
```

## Quickstart

```tsx
import { loadFilecheck } from 'filecheck-js';
import { FilecheckProvider, FilecheckIntake } from 'filecheck-react';
import { useState } from 'react';

const filecheckPromise = loadFilecheck('pk_your_publishable_key');

function Checkout() {
  const [canProceed, setCanProceed] = useState(false);
  const [jobId, setJobId] = useState('');

  return (
    <FilecheckProvider filecheck={filecheckPromise}>
      <FilecheckIntake
        workflowId="wf_…"
        onStatus={(s) => {
          setCanProceed(s.canProceed); // authoritative submit gate
          setJobId(s.jobId ?? '');      // verify server-side before fulfilling
        }}
      />
      <form method="post" action="/checkout">
        <input type="hidden" name="filecheck_job_id" value={jobId} readOnly />
        <button type="submit" disabled={!canProceed}>Add to cart</button>
      </form>
    </FilecheckProvider>
  );
}
```

## API

### `<FilecheckProvider filecheck>`

Provides the Filecheck factory to descendants. `filecheck` accepts the promise returned by
`loadFilecheck(...)`, an already-resolved instance, or `null`.

### `<FilecheckIntake />`

| Prop | Kind | Notes |
|---|---|---|
| `workflowId` | mutable | applied via `element.update()` |
| `ui`, `locale` | mutable | applied via `element.update()`; inline literals are compared by value |
| `connector` | mutable | applied via `element.setConnector()` — never recreates |
| `jobId`, `presentation`, `connectorId`, `preview`, `workflow` | identity | changing one recreates the element (instances are single-use) |
| `onReady`, `onStatus`, `onFacts`, `onUi`, `onError`, `onProof`, `onFileSelect`, `onDownload`, `onDestroy`, `onConnectorApply` | callbacks | latest-ref pattern — inline functions are safe and never re-subscribe |
| `id`, `className`, `style` | slot | applied to the wrapper `<div>` |

Safe under React 18 StrictMode: the dev double-mount produces exactly one live iframe.

### `ref`

```tsx
const ref = useRef<FilecheckIntakeRef>(null);
<FilecheckIntake ref={ref} … />
// ref.current.element  — the raw FilecheckIntakeElement
// ref.current.focus() / .blur() / .respondToProof(approved)
```

### `useFilecheck()`

Returns the resolved `FilecheckInstance` (or `null` while loading) for imperative use — e.g.
creating a `report` element yourself. Throws outside `<FilecheckProvider>`.

All `filecheck-js` types are re-exported from this package.

## Example

See [`examples/react-vite`](examples/react-vite) —
`pnpm --filter react-vite-example dev` with `VITE_FILECHECK_PK` set.

## License

MIT
