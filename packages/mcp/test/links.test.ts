import { describe, expect, it } from 'vitest';
import { REMOTE_CAPABILITIES } from '../src/capabilities.js';
import { call, connectHarness } from './helpers/mcp-client.js';

// ChatGPT appends ?utm_source=chatgpt.com to links it shows, which breaks S3
// presigned URLs (the query string is signed). The hosted server rewrites them.
const PRESIGNED =
  'https://filecheck-cdn.s3-accelerate.amazonaws.com/optimized_1.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600';
const job = {
  id: 'job_1',
  status: 'done',
  outcome: 'fixed',
  tasks: [],
  results: {},
  deliverables: [
    {
      role: 'output',
      taskId: 'task_1',
      bucket: 'filecheck-cdn',
      key: 'optimized_1.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      downloadUrl: PRESIGNED,
      expiresIn: 3600,
    },
    {
      role: 'proof',
      kind: 'image',
      downloadUrl: 'https://cdn.filecheck.io/proof.png',
      expiresIn: null,
    },
  ],
};
const links = {
  rewrite: (url: string) =>
    url.includes('X-Amz-Signature')
      ? `https://api.filecheck.io/files/token-for-${url.split('/')[3]!.split('?')[0]}`
      : url,
  ttlSeconds: 7 * 86_400,
};

describe('download links', () => {
  it('the hosted server hands out rewritten links, with their own lifetime', async () => {
    const harness = await connectHarness(
      [{ status: 200, body: JSON.stringify({ job }) }],
      REMOTE_CAPABILITIES,
      links,
    );
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_1' });
    const [output, proof] = result.structured.deliverables;
    expect(output.downloadUrl).toBe('https://api.filecheck.io/files/token-for-optimized_1.pdf');
    expect(output.expiresIn).toBe(7 * 86_400);
    expect(output.bucket).toBeUndefined();
    expect(proof.downloadUrl).toBe('https://cdn.filecheck.io/proof.png');
    expect(proof.expiresIn).toBeNull();
    expect(result.text).toContain('download links last 7 days');
    expect(JSON.stringify(result.structured)).not.toContain('X-Amz-Signature');
    await harness.close();
  });

  it('without a rewriter, links are returned as the API gave them', async () => {
    const harness = await connectHarness([{ status: 200, body: JSON.stringify({ job }) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_1' });
    expect(result.structured.deliverables[0].downloadUrl).toBe(PRESIGNED);
    expect(result.text).toContain('~60 minutes');
    await harness.close();
  });
});
