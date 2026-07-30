/**
 * Typed error hierarchy. The API has no machine-readable error codes — only
 * an HTTP status and a human message — so handle errors by class/status,
 * never by matching message text (server messages are unstable).
 *
 * Two error body shapes exist:
 *   - app errors:          `{ "error": true, "message": "…" }`
 *   - API Gateway auth:    `{ "message": "Unauthorized" | "Forbidden" }`
 * plus occasional non-JSON bodies (HTML 502s from intermediaries).
 */

export class FilecheckError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  /** Parsed response body, when it was JSON. */
  readonly body?: unknown;

  constructor(
    message: string,
    options: { status?: number; requestId?: string; body?: unknown } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.status = options.status;
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

/** 401 / 403 — bad, disabled, or wrong-kind key. */
export class AuthenticationError extends FilecheckError {}
/** 400 — the request body failed validation. */
export class InvalidRequestError extends FilecheckError {}
/** 404 — job / resource not found. */
export class NotFoundError extends FilecheckError {}
/** 429 — throttled (not emitted by the app today; handled defensively). */
export class RateLimitError extends FilecheckError {}
/** 5xx or unexpected status. */
export class APIError extends FilecheckError {}
/** The request never produced an HTTP response (network failure, timeout). */
export class ConnectionError extends FilecheckError {}
/** Webhook signature verification failed. */
export class WebhookSignatureError extends FilecheckError {}

export function parseErrorBody(text: string): { message: string | null; body: unknown } {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object') {
      const message = (body as { message?: unknown }).message;
      return { message: typeof message === 'string' ? message : null, body };
    }
    return { message: null, body };
  } catch {
    return { message: null, body: undefined };
  }
}

export function errorFromResponse(
  status: number,
  bodyText: string,
  requestId?: string,
): FilecheckError {
  const { message, body } = parseErrorBody(bodyText);
  const options = { status, requestId, body };
  const text = message ?? `Request failed with status ${status}`;

  if (status === 401 || status === 403) return new AuthenticationError(text, options);
  if (status === 400) return new InvalidRequestError(text, options);
  if (status === 404) return new NotFoundError(text, options);
  if (status === 429) return new RateLimitError(text, options);
  return new APIError(text, options);
}
