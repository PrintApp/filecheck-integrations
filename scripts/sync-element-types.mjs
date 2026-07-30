#!/usr/bin/env node
/**
 * Drift check for the types vendored into packages/element-js/src/types.
 *
 * The vendored files are hand-maintained (interfaces only, with deliberate
 * nullability fixes documented in each file header), so this script does not
 * overwrite them. Instead it hashes the upstream source-of-truth files in the
 * `filecheck` repo and compares against the manifest recorded at the last
 * vendoring. Any mismatch means upstream changed and the vendored types must
 * be reviewed by hand before the next release.
 *
 * Usage:
 *   node scripts/sync-element-types.mjs            # check against ../filecheck
 *   FILECHECK_REPO=/path/to/filecheck node scripts/sync-element-types.mjs
 *   node scripts/sync-element-types.mjs --update   # re-record the manifest
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.env.FILECHECK_REPO ?? join(here, '..', '..', 'filecheck'));
const manifestPath = join(here, 'element-types.manifest.json');

const UPSTREAM_FILES = [
  'packages/element/src/Filecheck.ts',
  'packages/element/src/Elements.ts',
  'packages/element/src/Element.ts',
  'packages/element/src/bootstrap.ts',
  'packages/element/src/iife.ts',
  'packages/element/src/elements/IntakeElement.ts',
  'packages/element/src/elements/ReportElement.ts',
  'packages/element/src/types/intake.ts',
  'packages/element/src/types/ui.ts',
  'packages/element/src/types/events.ts',
  'packages/element/src/types/connector.ts',
  'packages/element/src/types/report.ts',
  'packages/element/src/transport/protocol.ts',
  'packages/element/src/dom/connector.ts',
];

if (!existsSync(repo)) {
  console.error(`filecheck repo not found at ${repo} — set FILECHECK_REPO`);
  process.exit(2);
}

const current = {};
for (const rel of UPSTREAM_FILES) {
  const path = join(repo, rel);
  if (!existsSync(path)) {
    console.error(`missing upstream file: ${path}`);
    process.exit(2);
  }
  current[rel] = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

if (process.argv.includes('--update')) {
  writeFileSync(manifestPath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`manifest updated (${UPSTREAM_FILES.length} files) → ${manifestPath}`);
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error('no manifest recorded yet — run with --update after vendoring');
  process.exit(2);
}

const recorded = JSON.parse(readFileSync(manifestPath, 'utf8'));
const drifted = UPSTREAM_FILES.filter((rel) => recorded[rel] !== current[rel]);

if (drifted.length === 0) {
  console.log('vendored element types are in sync with upstream');
} else {
  console.error('upstream element sources changed since last vendoring — review these files');
  console.error('and update packages/element-js/src/types, then re-run with --update:');
  for (const rel of drifted) console.error(`  ${rel}`);
  process.exit(1);
}
