#!/usr/bin/env node
/**
 * Copies the public API's request schemas (filecheck-api/api/schemas/*.json)
 * into packages/mcp/src/api-schemas, minified. The MCP's setup_reference tool
 * serves them to agents, and the setup tools' descriptions point at them; the
 * API stays the one place they are written (and the one that validates).
 *
 * Usage:
 *   node scripts/sync-api-schemas.mjs            # copy from ../filecheck-api
 *   node scripts/sync-api-schemas.mjs --check    # exit 1 when the copies drifted
 *   FILECHECK_API_REPO=/path/to/filecheck-api node scripts/sync-api-schemas.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.env.FILECHECK_API_REPO ?? join(here, '..', '..', 'filecheck-api'));
const source = join(repo, 'api', 'schemas');
const target = join(here, '..', 'packages', 'mcp', 'src', 'api-schemas');

// The schemas the MCP's setup tools take. Order = setup_reference's enum order.
export const SCHEMAS = [
  'workflow',
  'rule',
  'profile',
  'connector',
  'optimize-preset',
  'destination',
  'product-map',
  'settings',
  'webhook',
];

if (!existsSync(source)) {
  console.error(`No API schemas at ${source}. Set FILECHECK_API_REPO to a filecheck-api checkout.`);
  process.exit(2);
}

const check = process.argv.includes('--check');
const missing = SCHEMAS.filter((name) => !existsSync(join(source, `${name}.json`)));
if (missing.length) {
  console.error(`Missing upstream schemas: ${missing.join(', ')}`);
  process.exit(2);
}
const extra = readdirSync(source).filter(
  (file) => file.endsWith('.json') && !SCHEMAS.includes(file.slice(0, -5)),
);
if (extra.length) console.warn(`Not copied (not a setup tool schema): ${extra.join(', ')}`);

let drifted = 0;
for (const name of SCHEMAS) {
  const minified = `${JSON.stringify(JSON.parse(readFileSync(join(source, `${name}.json`), 'utf8')))}\n`;
  const out = join(target, `${name}.json`);
  const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (current === minified) continue;
  drifted += 1;
  if (check) console.error(`drifted: ${name}.json`);
  else {
    writeFileSync(out, minified);
    console.log(`updated: ${name}.json (${minified.length} bytes)`);
  }
}

if (check && drifted) {
  console.error(
    `${drifted} schema(s) differ from ${source}. Run: node scripts/sync-api-schemas.mjs`,
  );
  process.exit(1);
}
if (!drifted) console.log('API schemas are in sync.');
