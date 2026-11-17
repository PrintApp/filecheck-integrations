import { describe, expect, it } from 'vitest';
import { REMOTE_CAPABILITIES } from '../src/capabilities.js';
import { call, connectHarness } from './helpers/mcp-client.js';

// The API ends a job as status error / outcome na when every source failed,
// and records why on job.summary. The MCP shows that reason, so a chat can
// say "that link isn't reachable" instead of a generic failure.
const failedJob = (error: string, failedSources: unknown[]) => ({
  id: 'job_failed',
  status: 'error',
  outcome: 'na',
  tasks: [],
  results: {},
  deliverables: [],
  summary: {
    id: 'job_failed',
    status: 'error',
    outcome: 'na',
    taskIds: [],
    sourceRefs: [],
    error,
    failedSources,
  },
});

describe('failure reason', () => {
  it('a refused link: the reason, the source, and a next step asking for a public link', async () => {
    const reason =
      'Source could not be collated: URL not allowed (internal address): http://169.254.169.254/latest/meta-data/';
    const job = failedJob(reason, [
      {
        index: 0,
        source: 'http://169.254.169.254/latest/meta-data/',
        fileRef: null,
        error: 'URL not allowed (internal address): http://169.254.169.254/latest/meta-data/',
      },
    ]);
    const harness = await connectHarness(
      [{ status: 200, body: JSON.stringify({ job }) }],
      REMOTE_CAPABILITIES,
    );
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_failed' });
    expect(result.isError).toBe(false);
    expect(result.structured.status).toBe('error');
    expect(result.structured.error).toBe(reason);
    expect(result.structured.failedSources).toEqual([
      expect.objectContaining({ index: 0, source: 'http://169.254.169.254/latest/meta-data/' }),
    ]);
    expect(result.structured.verdict).toContain(
      'Reason: Source could not be collated: URL not allowed',
    );
    expect(result.structured.nextStep).toContain('public link');
    expect(result.text).toContain('public link');
    await harness.close();
  });

  it('another failure: the reason and a generic next step', async () => {
    const job = failedJob(
      'Source could not be collated: upload not found in filecheck-spirit: upload_x',
      [
        {
          index: 0,
          source: null,
          fileRef: 'upload_x',
          error: 'upload not found in filecheck-spirit: upload_x',
        },
      ],
    );
    const harness = await connectHarness([{ status: 200, body: JSON.stringify({ job }) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_failed' });
    expect(result.structured.error).toContain('upload not found');
    expect(result.structured.nextStep).toContain('submit it again');
    await harness.close();
  });

  it('a finished job is unchanged: no error, no nextStep', async () => {
    const job = {
      id: 'job_ok',
      status: 'done',
      outcome: 'pass',
      tasks: [],
      results: {},
      deliverables: [],
      summary: { id: 'job_ok', status: 'done', outcome: 'pass' },
    };
    const harness = await connectHarness([{ status: 200, body: JSON.stringify({ job }) }]);
    const result = await call(harness.mcp, 'get_job', { jobId: 'job_ok' });
    expect(result.structured.verdict).toBe('File is print-ready.');
    expect(result.structured.error).toBeUndefined();
    expect(result.structured.nextStep).toBeUndefined();
    await harness.close();
  });
});
