# Filecheck Integrations

Official Filecheck packages for custom stacks. All browser wrappers are thin shims around the
Element loaded from `https://cdn.filecheck.io/element/v1/filecheck.js` — they never bundle or
reimplement Element logic.

| Package | Registry | Purpose |
|---|---|---|
| [`filecheck-js`](packages/element-js) | npm | Typed async loader for the CDN Element script + all shared TypeScript types |
| [`filecheck-react`](packages/react) | npm | React component + hook wrapping the Element |
| [`filecheck-vue`](packages/vue) | npm | Vue 3 component + composable wrapping the Element |
| [`filecheck`](packages/node) | npm | Server SDK: jobs API, uploads, webhooks, `jobs.verify()` |
| [`filecheck/filecheck-php`](filecheck-php) | Packagist | PHP server SDK mirroring `filecheck` (standalone repo, nested here) |

## Development

```bash
pnpm install
pnpm build       # build all packages
pnpm test        # vitest across the workspace
pnpm typecheck   # tsc --strict per package
pnpm lint        # biome
pnpm size        # element-js bundle-size gate (< 3 kB min+gzip)
```

The PHP SDK lives in `filecheck-php/` as its own git repository (Packagist requires the repo root
to be the composer.json root); it is excluded from this repo's git history. See
`filecheck-php/README.md`.

Releases are driven by [changesets](https://github.com/changesets/changesets): `pnpm changeset` to
record a change, CI publishes from `main`. All packages are independently versioned, MIT licensed,
and start at `0.1.0` (1.0.0 only after the Element API is confirmed stable).

## Type vendoring

`filecheck-js` vendors the Element's public types from the `filecheck` repo
(`packages/element/src`). Run `pnpm sync:types` (with a sibling `../filecheck` checkout, or
`FILECHECK_REPO=<path>`) to diff the vendored copies against upstream before a release.
