import { AuthenticationError } from './errors.js';
import { FetchTransport } from './http/fetch.js';
import type { FetchLike } from './http/fetch.js';
import { Requestor } from './http/requestor.js';
import type { HttpTransport } from './http/transport.js';
import { JobsResource } from './resources/jobs.js';
import { LibraryResource } from './resources/library.js';
import { OrdersResource } from './resources/orders.js';
import { UploadsResource } from './resources/uploads.js';
import { webhooks } from './webhooks.js';

const DEFAULT_BASE_URL = 'https://api.filecheck.io';
/** Must comfortably exceed the API's ~27 s sync-submit wait (gateway 29 s). */
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

export interface FilecheckClientOptions {
  /** Default `https://api.filecheck.io`. */
  baseUrl?: string;
  /** Per-request timeout (default 60 000 ms). */
  timeoutMs?: number;
  /** Max auto-retries for idempotent (GET) requests (default 2). */
  maxRetries?: number;
  /** Inject a fetch implementation (tests, custom agents). */
  fetch?: FetchLike;
  /** Full transport override (edge runtimes). Wins over `fetch`. */
  transport?: HttpTransport;
}

/** `sk_…abc4` — safe to include in error messages and logs. */
export function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 3)}…${key.slice(-4)}` : 'sk_…';
}

export class Filecheck {
  readonly jobs: JobsResource;
  readonly uploads: UploadsResource;
  readonly orders: OrdersResource;
  readonly workflows: LibraryResource;
  readonly connectors: LibraryResource;
  readonly rules: LibraryResource;
  readonly profiles: LibraryResource;
  readonly optimizePresets: LibraryResource;
  readonly webhooks = webhooks;

  constructor(secretKey: string, options: FilecheckClientOptions = {}) {
    if (!secretKey || typeof secretKey !== 'string') {
      throw new AuthenticationError(
        'A secret key is required, e.g. new Filecheck(process.env.FILECHECK_SECRET_KEY)',
      );
    }
    if (secretKey.startsWith('pk_')) {
      throw new AuthenticationError(
        `${maskKey(secretKey)} is a publishable key. Publishable keys are browser-only (for the Element); the server SDK needs your secret key (sk_…) from the Filecheck dashboard.`,
      );
    }
    if (!secretKey.startsWith('sk_')) {
      throw new AuthenticationError('Invalid API key: secret keys start with "sk_"');
    }

    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const transport = options.transport ?? new FetchTransport(options.fetch);

    const requestor = new Requestor(transport, baseUrl, secretKey, timeoutMs, maxRetries);

    this.jobs = new JobsResource(requestor);
    this.uploads = new UploadsResource(requestor, transport, timeoutMs);
    this.orders = new OrdersResource(requestor);
    this.workflows = new LibraryResource(requestor, '/workflows', 'workflows', 'workflow');
    this.connectors = new LibraryResource(requestor, '/connectors', 'connectors', 'connector');
    this.rules = new LibraryResource(requestor, '/rules', 'rules', 'rule');
    this.profiles = new LibraryResource(requestor, '/profiles', 'profiles', 'profile');
    this.optimizePresets = new LibraryResource(requestor, '/optimize-presets', 'presets', 'preset');
  }
}
