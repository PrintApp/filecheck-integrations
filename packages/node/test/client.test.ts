import { describe, expect, it } from 'vitest';
import { AuthenticationError, Filecheck, maskKey } from '../src/index.js';
import { createMockFetch, fixture } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

describe('Filecheck client', () => {
  it('accepts an sk_ key', () => {
    expect(() => new Filecheck(SK)).not.toThrow();
  });

  it('rejects a pk_ key with a message naming the mistake', () => {
    try {
      new Filecheck('pk_01jf8n2q4vxw9k3m5p7r9t1v3x');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toMatch(/publishable key/i);
      expect((error as Error).message).toMatch(/secret key/i);
      // never echo the full key
      expect((error as Error).message).not.toContain('pk_01jf8n2q4vxw9k3m5p7r9t1v3x');
    }
  });

  it('rejects empty and malformed keys', () => {
    expect(() => new Filecheck('')).toThrow(AuthenticationError);
    expect(() => new Filecheck('whatever')).toThrow(AuthenticationError);
  });

  it('masks keys', () => {
    expect(maskKey(SK)).toBe('sk_…cdef');
    expect(maskKey('sk_x')).toBe('sk_…');
  });

  it('sends bearer auth, user-agent, and respects baseUrl', async () => {
    const { mockFetch, requests } = createMockFetch({
      status: 200,
      body: fixture('job.full.json'),
    });
    const fc = new Filecheck(SK, {
      fetch: mockFetch,
      baseUrl: 'https://staging.api.filecheck.io/',
    });
    await fc.jobs.retrieve('job_1');

    expect(requests[0]!.url).toBe('https://staging.api.filecheck.io/jobs/job_1');
    expect(requests[0]!.headers.authorization).toBe(`Bearer ${SK}`);
    expect(requests[0]!.headers['user-agent']).toMatch(/^filecheck-node\//);
  });
});
