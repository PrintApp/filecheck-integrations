import { errorFromResponse } from '../errors.js';
import { VERSION } from '../version.js';
import { withRetries } from './retry.js';
import type { HttpResponse, HttpTransport } from './transport.js';

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Only idempotent requests are ever auto-retried. */
  idempotent?: boolean;
}

/** Bound transport + auth. All resources go through this. */
export class Requestor {
  constructor(
    private readonly transport: HttpTransport,
    private readonly baseUrl: string,
    private readonly secretKey: string,
    private readonly timeoutMs: number,
    private readonly maxRetries: number,
  ) {}

  async raw(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpResponse> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.secretKey}`,
      accept: 'application/json',
      'user-agent': `filecheck-node/${VERSION}`,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    return withRetries(
      () =>
        this.transport.request({
          method,
          url: url.toString(),
          headers,
          body,
          timeoutMs: this.timeoutMs,
        }),
      { idempotent: options.idempotent ?? method === 'GET', maxRetries: this.maxRetries },
    );
  }

  /** Request + parse. Throws a typed FilecheckError on any non-2xx. */
  async json<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<{ status: number; data: T }> {
    const response = await this.raw(method, path, options);
    const requestId = response.headers.get('apigw-requestid') ?? undefined;
    if (response.status < 200 || response.status >= 300) {
      throw errorFromResponse(response.status, response.text, requestId);
    }
    try {
      return { status: response.status, data: JSON.parse(response.text) as T };
    } catch {
      throw errorFromResponse(response.status, response.text, requestId);
    }
  }
}
