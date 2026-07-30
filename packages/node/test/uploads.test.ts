import { describe, expect, it } from 'vitest';
import { APIError, Filecheck, InvalidRequestError } from '../src/index.js';
import { createMockFetch, fixture, fixtureJson } from './helpers/mock-fetch.js';

const SK = 'sk_0123456789abcdef0123456789abcdef';

describe('uploads.create', () => {
  it('presigns then multipart-POSTs to S3 with fields before the file', async () => {
    const { mockFetch, requests } = createMockFetch(
      { status: 200, body: fixture('upload.presign.json') },
      { status: 204 },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch });

    const result = await fc.uploads.create(Buffer.from('%PDF-1.7 test'), {
      mimeType: 'application/pdf',
      fileName: 'artwork.pdf',
    });

    expect(result.fileRef).toBe('upload_01jf8n2p3uvw8j2l4n6p8r0t2v');

    // Leg 1: presign request with mimeType + sizeBytes
    expect(requests[0]!.url).toBe('https://api.filecheck.io/uploads');
    const presignBody = JSON.parse(requests[0]!.body as string);
    expect(presignBody).toMatchObject({ mimeType: 'application/pdf', sizeBytes: 13 });

    // Leg 2: S3 multipart POST — fields first, file part last, no auth header
    expect(requests[1]!.url).toBe('https://fc-uploads.s3.amazonaws.com/');
    expect(requests[1]!.headers.authorization).toBeUndefined();
    const form = requests[1]!.body as FormData;
    const entries = [...form.entries()];
    const expectedFields = fixtureJson('upload.presign.json').upload.fields;
    expect(entries[entries.length - 1]![0]).toBe('file');
    for (const key of Object.keys(expectedFields)) {
      expect(form.get(key)).toBe(expectedFields[key]);
    }
    const filePart = form.get('file') as unknown as { name: string };
    expect(filePart.name).toBe('artwork.pdf');
  });

  it('rejects oversize files before touching S3', async () => {
    const presign = fixtureJson('upload.presign.json');
    presign.maxBytes = 4;
    const { mockFetch, requests } = createMockFetch({
      status: 200,
      body: JSON.stringify(presign),
    });
    const fc = new Filecheck(SK, { fetch: mockFetch });

    await expect(fc.uploads.create(Buffer.from('too large'))).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
    expect(requests).toHaveLength(1); // never reached S3
  });

  it('surfaces S3-leg failures as APIError naming the S3 leg', async () => {
    const { mockFetch } = createMockFetch(
      { status: 200, body: fixture('upload.presign.json') },
      { status: 403, body: '<Error><Code>AccessDenied</Code></Error>' },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch });

    const error = await fc.uploads.create(Buffer.from('x')).catch((e) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error.message).toMatch(/S3 upload leg/);
    expect(error.status).toBe(403);
  });

  it('accepts Blob input', async () => {
    const { mockFetch } = createMockFetch(
      { status: 200, body: fixture('upload.presign.json') },
      { status: 201 },
    );
    const fc = new Filecheck(SK, { fetch: mockFetch });
    const blob = new Blob(['data'], { type: 'image/png' });
    const result = await fc.uploads.create(blob);
    expect(result.fileRef).toContain('upload_');
  });
});
