import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, connectHarness } from './helpers/mcp-client.js';
import { jobBody, makePreflightJob } from './helpers/mock-fetch.js';

// save_artifact downloads via global fetch (S3 presigned URL), separate from
// the API client's injected fetch.
function stubDownload(bytes: Buffer) {
  const download = vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  }));
  vi.stubGlobal('fetch', download);
  return download;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('save_artifact', () => {
  it('saves the only deliverable into a directory using its fileName', async () => {
    const bytes = Buffer.from('%PDF-1.4 saved');
    const download = stubDownload(bytes);
    const dir = await mkdtemp(join(tmpdir(), 'fc-mcp-save-'));
    const job = makePreflightJob();
    const harness = await connectHarness([{ status: 200, body: jobBody(job) }]);

    const result = await call(harness.mcp, 'save_artifact', {
      jobId: job.id as string,
      outPath: dir,
    });

    expect(result.isError).toBe(false);
    expect(download).toHaveBeenCalledTimes(1);
    const savedTo = result.structured.savedTo as string;
    expect(savedTo).toBe(join(dir, 'card.pdf'));
    expect(result.structured.bytes).toBe(bytes.length);
    expect(await readFile(savedTo, 'utf8')).toBe('%PDF-1.4 saved');
    await harness.close();
  });

  it('lists the options when the selector matches nothing', async () => {
    stubDownload(Buffer.from('x'));
    const job = makePreflightJob();
    const harness = await connectHarness([{ status: 200, body: jobBody(job) }]);
    const result = await call(harness.mcp, 'save_artifact', {
      jobId: job.id as string,
      deliverable: 'no-such-file.pdf',
      outPath: tmpdir(),
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('card.pdf');
    await harness.close();
  });
});
