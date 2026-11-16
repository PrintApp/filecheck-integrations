import connector from './api-schemas/connector.json' with { type: 'json' };
import destination from './api-schemas/destination.json' with { type: 'json' };
import optimizePreset from './api-schemas/optimize-preset.json' with { type: 'json' };
import productMap from './api-schemas/product-map.json' with { type: 'json' };
import profile from './api-schemas/profile.json' with { type: 'json' };
import rule from './api-schemas/rule.json' with { type: 'json' };
import settings from './api-schemas/settings.json' with { type: 'json' };
import webhook from './api-schemas/webhook.json' with { type: 'json' };
import workflow from './api-schemas/workflow.json' with { type: 'json' };

/**
 * The public API's request schemas (copied by scripts/sync-api-schemas.mjs),
 * served to agents on demand: the big ones (profile ≈130 KB) are far too large
 * to inline as tool input schemas, so setup_reference returns an overview and
 * lets the agent drill in by JSON pointer.
 */
export const SCHEMAS = {
  workflow,
  rule,
  profile,
  connector,
  'optimize-preset': optimizePreset,
  destination,
  'product-map': productMap,
  settings,
  webhook,
} as const satisfies Record<string, unknown>;

export type SchemaType = keyof typeof SCHEMAS;
export const SCHEMA_TYPES = Object.keys(SCHEMAS) as [SchemaType, ...SchemaType[]];

/** A node this size or smaller is returned whole; bigger ones as an overview. */
export const FULL_LIMIT = 12_000;
const DESCRIPTION_LIMIT = 400;

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const clip = (text: unknown, limit = DESCRIPTION_LIMIT): string | undefined =>
  typeof text === 'string'
    ? text.length > limit
      ? `${text.slice(0, limit)}… (more at this node's own path)`
      : text
    : undefined;

/** RFC 6901 pointer (with or without the leading '#') → the node, or undefined. */
export function resolvePointer(root: unknown, pointer: string): unknown {
  const path = pointer.replace(/^#/, '');
  if (path === '' || path === '/') return root;
  let node: unknown = root;
  for (const raw of path.replace(/^\//, '').split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(node)) node = node[Number(key)];
    else if (isNode(node)) node = node[key];
    else return undefined;
    if (node === undefined) return undefined;
  }
  return node;
}

function typeOf(node: Node): unknown {
  if (node.type !== undefined) return node.type;
  if (typeof node.$ref === 'string') return { $ref: node.$ref };
  if (Array.isArray(node.enum)) return 'enum';
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(node[key])) return `${key} (${(node[key] as unknown[]).length})`;
  }
  return undefined;
}

/** One line per property: its type, a clipped description, enum values. */
function propertySummary(node: Node): Node {
  const out: Node = { type: typeOf(node) };
  const description = clip(node.description, 200);
  if (description) out.description = description;
  if (Array.isArray(node.enum)) out.enum = node.enum.slice(0, 30);
  if (node.default !== undefined) out.default = node.default;
  if (isNode(node.items)) out.items = typeOf(node.items);
  return out;
}

/** A large node, one level deep: what is in it and the paths to read next. */
export function overview(node: Node, path: string): Node {
  const out: Node = {};
  for (const key of ['title', '$id', 'type'] as const) {
    if (node[key] !== undefined) out[key] = node[key];
  }
  const description = clip(node.description, 1_500);
  if (description) out.description = description;
  if (Array.isArray(node.required)) out.required = node.required;
  if (isNode(node.properties)) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [
        key,
        isNode(value) ? propertySummary(value) : value,
      ]),
    );
  }
  if (isNode(node.items)) out.items = propertySummary(node.items);
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(node[key])) {
      out[key] = (node[key] as unknown[]).map((branch) =>
        isNode(branch) ? (clip(branch.description, 200) ?? typeOf(branch) ?? 'constraint') : branch,
      );
    }
  }
  if (isNode(node.definitions)) out.definitions = Object.keys(node.definitions);
  const base = path === '' ? '' : path;
  out.readNext = [
    ...(isNode(node.properties) ? [`${base}/properties/<name>`] : []),
    ...(isNode(node.definitions) ? [`${base}/definitions/<name>`] : []),
    ...(['oneOf', 'anyOf', 'allOf'] as const)
      .filter((key) => Array.isArray(node[key]))
      .map((key) => `${base}/${key}/<index>`),
  ];
  return out;
}

export interface Reference {
  type: SchemaType;
  path: string;
  /** True when `schema` is the node itself; false when it is an overview of a large node. */
  complete: boolean;
  schema: unknown;
}

export function schemaReference(type: SchemaType, pointer = ''): Reference | null {
  const path = pointer.replace(/^#/, '').replace(/\/$/, '');
  const node = resolvePointer(SCHEMAS[type], path);
  if (node === undefined) return null;
  const complete = !isNode(node) || JSON.stringify(node).length <= FULL_LIMIT;
  return { type, path: path || '/', complete, schema: complete ? node : overview(node, path) };
}
