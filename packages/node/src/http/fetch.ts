import { ConnectionError } from '../errors.js';
import type { HttpRequest, HttpResponse, HttpTransport } from './transport.js';

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | FormData;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** Built-in-fetch transport (Node 18+). `fetch` is injectable for tests/edge. */
export class FetchTransport implements HttpTransport {
  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = req.timeoutMs > 0 ? setTimeout(() => controller.abort(), req.timeoutMs) : null;

    try {
      const response = await this.fetchImpl(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ConnectionError(`Request to ${req.url} timed out after ${req.timeoutMs}ms`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Request to ${req.url} failed: ${message}`);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
}
