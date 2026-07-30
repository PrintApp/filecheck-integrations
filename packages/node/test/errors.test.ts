import { describe, expect, it } from 'vitest';
import {
  APIError,
  AuthenticationError,
  ConnectionError,
  Filecheck,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from '../src/index.js';
import { createMockFetch, fixture } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

function client(...responses: Parameters<typeof createMockFetch>) {
  const mock = createMockFetch(...responses);
  return { fc: new Filecheck(SK, { fetch: mock.mockFetch, maxRetries: 0 }), ...mock };
}

describe('error mapping', () => {
  it('maps app 400 to InvalidRequestError with the server message', async () => {
    const { fc } = client({ status: 400, body: fixture('errors/app-400.json') });
    const error = await fc.jobs.retrieve('job_x').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidRequestError);
    expect(error.status).toBe(400);
    expect(error.body).toMatchObject({ error: true });
  });

  it('maps app 404 to NotFoundError', async () => {
    const { fc } = client({ status: 404, body: fixture('errors/app-404.json') });
    await expect(fc.jobs.retrieve('job_missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps gateway 401 (bare {message}) to AuthenticationError', async () => {
    const { fc } = client({ status: 401, body: fixture('errors/gw-401.json') });
    const error = await fc.jobs.retrieve('job_x').catch((e) => e);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Unauthorized');
  });

  it('maps gateway 403 (bare {message}) to AuthenticationError', async () => {
    const { fc } = client({ status: 403, body: fixture('errors/gw-403.json') });
    const error = await fc.jobs.retrieve('job_x').catch((e) => e);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.status).toBe(403);
  });

  it('maps 429 to RateLimitError', async () => {
    const { fc } = client({ status: 429, body: '{"message":"Too Many Requests"}' });
    await expect(fc.jobs.retrieve('job_x')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('handles non-JSON bodies (HTML 502) as APIError', async () => {
    const { fc } = client({ status: 502, body: fixture('errors/html-502.txt') });
    const error = await fc.jobs.retrieve('job_x').catch((e) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/status 502/);
  });

  it('wraps network failures in ConnectionError', async () => {
    const { fc } = client({ status: 0, error: new TypeError('fetch failed') });
    await expect(fc.jobs.retrieve('job_x')).rejects.toBeInstanceOf(ConnectionError);
  });
});
