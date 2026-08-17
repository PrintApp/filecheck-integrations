import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isTerminal } from 'filecheck-node';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { formatJobResult, jsonResult, toolErrorResult } from '../format.js';
import { jobOutputShape } from '../schemas.js';

export function registerJobTools(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    'get_job',
    {
      title: 'Get a job (poll / refresh URLs)',
      description:
        'Fetch a job by id: current status + outcome, per-file results, and FRESHLY SIGNED download URLs (~60 min TTL). ' +
        'This is both the polling target for pending jobs and the way to refresh expired download URLs. ' +
        '`status` is execution, `outcome` is the verdict — status:done + outcome:fail means checked successfully but NOT print-ready.',
      inputSchema: {
        jobId: z.string().describe('The job_… id returned by a submit tool.'),
      },
      outputSchema: jobOutputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const job = await client.jobs.retrieve(args.jobId);
        return formatJobResult({ job, pending: !isTerminal(job) });
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'list_jobs',
    {
      title: 'List recent jobs',
      description:
        'List recent jobs (newest first) as lean envelopes: id, status, outcome, timestamps. ' +
        'Use get_job for details and download URLs. Pass the returned nextKey to fetch the next page.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Page size (default 20).'),
        nextKey: z.string().optional().describe('Opaque pagination cursor from a previous call.'),
      },
      outputSchema: {
        jobs: z.array(z.object({}).passthrough()),
        nextKey: z
          .string()
          .nullable()
          .optional()
          .describe('Pass back to fetch the next page; absent on the last page.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const page = await client.jobs.list({ limit: args.limit ?? 20, nextKey: args.nextKey });
        const jobs = page.jobs.map((job) => ({
          jobId: job.id,
          status: job.status,
          outcome: job.outcome ?? null,
          createdAt: job.createdAt,
          channel: job.channel,
          orderId: job.orderId,
          fileCount: job.tasks.length,
        }));
        const structured: Record<string, unknown> = { jobs };
        if (page.nextKey) structured.nextKey = page.nextKey;
        return jsonResult(
          structured,
          `${jobs.length} job(s)${page.nextKey ? ' (more available via nextKey)' : ''}. Remember: outcome is the verdict, status is only execution.`,
        );
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );

  server.registerTool(
    'delete_job',
    {
      title: 'Delete a job',
      description:
        'Soft-delete a job and its tasks. The job disappears from listings and its artifacts are scheduled for cleanup. Not undoable via the API.',
      inputSchema: {
        jobId: z.string().describe('The job_… id to delete.'),
      },
      outputSchema: {
        deleted: z.boolean(),
        jobId: z.string(),
        taskIds: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await client.jobs.del(args.jobId);
        return jsonResult(
          {
            deleted: true,
            jobId: result.id,
            ...(result.taskIds ? { taskIds: result.taskIds } : {}),
          },
          `Job ${result.id} deleted.`,
        );
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
