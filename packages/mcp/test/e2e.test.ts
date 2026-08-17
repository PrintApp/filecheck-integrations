import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Filecheck } from 'filecheck-node';
import { describe, expect, it } from 'vitest';
import { LOCAL_CAPABILITIES } from '../src/capabilities.js';
import { createFilecheckMcp } from '../src/server.js';
import { call } from './helpers/mcp-client.js';

/**
 * Real-API smoke test. Opt-in: set FC_API_KEY (and optionally FC_API_BASE).
 * Uploads a tiny generated PDF via check_file(filePath) and follows the job
 * to a terminal status through get_job.
 */
const API_KEY = process.env.FC_API_KEY;

/** A minimal single-page A4 PDF with a computed xref table. */
function minimalPdf(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>\nendobj\n',
  ];
  const header = '%PDF-1.4\n';
  let body = header;
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}

describe.skipIf(!API_KEY)('e2e against the real API', () => {
  it(
    'checks a local PDF end-to-end',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'fc-mcp-e2e-'));
      const filePath = join(dir, 'minimal.pdf');
      await writeFile(filePath, minimalPdf());

      const client = new Filecheck(API_KEY as string, {
        baseUrl: process.env.FC_API_BASE || undefined,
      });
      const server = createFilecheckMcp({ client, capabilities: LOCAL_CAPABILITIES });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const mcp = new Client({ name: 'e2e', version: '0.0.0' });
      await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);

      let result = await call(mcp, 'check_file', { source: { filePath } });
      expect(result.isError).toBe(false);
      const jobId = result.structured.jobId as string;
      expect(jobId).toMatch(/^job_/);

      const deadline = Date.now() + 90_000;
      while (result.structured.pending && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        result = await call(mcp, 'get_job', { jobId });
      }

      expect(result.structured.pending).toBeUndefined();
      expect(['done', 'skipped', 'error']).toContain(result.structured.status);
      // Both axes must always be present on a terminal read.
      expect(result.structured).toHaveProperty('outcome');
      expect(result.structured.verdict).toBeTruthy();

      await call(mcp, 'delete_job', { jobId });
      await mcp.close();
      await server.close();
    },
    { timeout: 120_000 },
  );
});
