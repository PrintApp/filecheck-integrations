/**
 * Minimal HTTP abstraction. The whole SDK talks to this interface so an
 * edge/Workers build only needs a different transport, not different
 * resources.
 */

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  /** JSON string, multipart form data, or nothing. */
  body?: string | FormData;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  text: string;
}

export interface HttpTransport {
  /**
   * Perform the request. Resolves for ANY HTTP status; rejects (with
   * ConnectionError) only when no response was produced at all.
   */
  request(req: HttpRequest): Promise<HttpResponse>;
}
