# @filecheck/vue

Vue 3 component and composable for the [Filecheck](https://filecheck.io) Element. A thin wrapper
over [`@filecheck/element-js`](../element-js) — the Element always loads from the Filecheck CDN.

Requires Vue ≥ 3.3 (Composition API). SSR-safe for Nuxt: no `window` access until `onMounted`.

## Install

```bash
npm install @filecheck/vue @filecheck/element-js
```

## Quickstart

```ts
// main.ts
import { FilecheckPlugin } from '@filecheck/vue';
app.use(FilecheckPlugin, { publishableKey: 'pk_your_publishable_key' });
```

```vue
<script setup lang="ts">
import { FilecheckIntake } from '@filecheck/vue';
import { ref } from 'vue';

const jobId = ref('');
const canProceed = ref(false);
</script>

<template>
  <FilecheckIntake
    workflow-id="wf_…"
    v-model:job-id="jobId"
    @status="(s) => (canProceed = s.canProceed)"
  />
  <form method="post" action="/checkout">
    <input type="hidden" name="filecheck_job_id" :value="jobId" />
    <button type="submit" :disabled="!canProceed">Add to cart</button>
  </form>
</template>
```

## API

### `FilecheckPlugin`

`app.use(FilecheckPlugin, options)` — loads the CDN script client-side and provides the factory.
Options: `publishableKey` (required), `agentId?`, `iframeSrc?`, `scriptUrl?`, `loadTimeoutMs?`, or
pass your own `filecheck` promise/instance instead.

### `<FilecheckIntake>`

| Prop | Kind | Notes |
|---|---|---|
| `workflowId`, `ui`, `locale` | mutable | applied via `element.update()` |
| `connector` | mutable | applied via `element.setConnector()` |
| `jobId`, `presentation`, `connectorId`, `preview`, `workflow` | identity | changing one recreates the element |

Events: `@ready`, `@status`, `@facts`, `@ui`, `@error`, `@proof`, `@file-select`, `@download`,
`@destroy`, `@connector-apply`, and `@update:jobId`.

**`v-model:jobId`** — the component emits `update:jobId` whenever a `status` event carries a job
id, so parents can bind the job id straight into form state. The write-back never recreates the
element; only an externally-authored `jobId` change does.

Template ref exposes `element` (the raw `FilecheckIntakeElement`), `focus()`, `blur()`, and
`respondToProof(approved)`.

### `useFilecheck()`

Returns `Readonly<ShallowRef<FilecheckInstance | null>>` for imperative use (e.g. creating a
`report` element). Throws if the plugin is not installed.

All `@filecheck/element-js` types are re-exported from this package.

## Example

See [`examples/vue-vite`](examples/vue-vite) —
`pnpm --filter vue-vite-example dev` with `VITE_FILECHECK_PK` set.

## License

MIT
