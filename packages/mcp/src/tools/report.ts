import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PreflightResult } from 'filecheck-node';
import { z } from 'zod';
import type { ToolContext } from '../capabilities.js';
import { jsonResult, toolErrorResult } from '../format.js';

const SEVERITIES = ['reject', 'warn', 'ignore'] as const;

export function registerGetReport(server: McpServer, { client }: ToolContext): void {
  server.registerTool(
    'get_report',
    {
      title: 'Read the raw preflight report',
      description:
        'Drill into the full preflight report of a checked file — the raw analysis (pages, fonts, images, color, spot colors, layers, …) plus the complete evaluation findings that job results cap. ' +
        'Call without `section` first for an overview of available sections and their sizes, then request one section at a time; array sections are paginated with offset/limit. ' +
        '`severity` filters the evaluation findings instead.',
      inputSchema: {
        jobId: z.string().describe('The job_… id of a completed check.'),
        taskIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Which file of the job (0-based, default 0) — jobs can contain several files.'),
        section: z
          .string()
          .optional()
          .describe(
            "Report section to read (e.g. 'fonts', 'images', 'pages', 'evaluation'). Omit for the overview.",
          ),
        severity: z
          .enum(SEVERITIES)
          .optional()
          .describe('Return only evaluation findings of this severity (overrides section).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Pagination offset into array sections (default 0).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max array entries to return (default 50).'),
      },
      outputSchema: {
        jobId: z.string(),
        taskIndex: z.number(),
        section: z.string().optional(),
        sections: z
          .array(z.object({}).passthrough())
          .optional()
          .describe('Overview: available sections and sizes.'),
        data: z.unknown().optional().describe('The requested slice.'),
        total: z.number().optional(),
        offset: z.number().optional(),
        returned: z.number().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const job = await client.jobs.retrieve(args.jobId);
        const preflights: PreflightResult[] = job.results?.preflight ?? [];
        const taskIndex = args.taskIndex ?? 0;
        const result = preflights[taskIndex];
        if (!result) {
          return toolErrorResult(
            new Error(
              preflights.length === 0
                ? `Job ${args.jobId} has no preflight results (status: ${job.status}). If it is still running, poll get_job first.`
                : `taskIndex ${taskIndex} is out of range — this job has ${preflights.length} preflighted file(s).`,
            ),
          );
        }
        const report = result.report as Record<string, unknown> | null;
        if (!report) {
          return toolErrorResult(
            new Error(`No report is stored for file ${taskIndex} of job ${args.jobId}.`),
          );
        }

        const offset = args.offset ?? 0;
        const limit = args.limit ?? 50;
        const base = { jobId: args.jobId, taskIndex };

        if (args.severity) {
          const evaluation = report.evaluation as
            | { findings?: Array<Record<string, unknown>> }
            | undefined;
          const findings = (evaluation?.findings ?? []).filter((f) => f.severity === args.severity);
          const slice = findings.slice(offset, offset + limit);
          return jsonResult(
            {
              ...base,
              section: 'evaluation.findings',
              data: slice,
              total: findings.length,
              offset,
              returned: slice.length,
            },
            `${findings.length} ${args.severity} finding(s); returned ${slice.length} from offset ${offset}.`,
          );
        }

        if (args.section) {
          if (!(args.section in report)) {
            return toolErrorResult(
              new Error(
                `Section '${args.section}' not in this report. Available: ${Object.keys(report).join(', ')}.`,
              ),
            );
          }
          const value = report[args.section];
          if (Array.isArray(value)) {
            const slice = value.slice(offset, offset + limit);
            return jsonResult(
              {
                ...base,
                section: args.section,
                data: slice,
                total: value.length,
                offset,
                returned: slice.length,
              },
              `Section '${args.section}': ${value.length} entries; returned ${slice.length} from offset ${offset}.`,
            );
          }
          return jsonResult(
            { ...base, section: args.section, data: value },
            `Section '${args.section}'.`,
          );
        }

        const sections = Object.entries(report).map(([key, value]) => ({
          key,
          kind: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
          ...(Array.isArray(value) ? { count: value.length } : {}),
        }));
        return jsonResult(
          { ...base, sections },
          `Report for file ${taskIndex} of job ${args.jobId} — ${sections.length} sections. Request one via 'section'.`,
        );
      } catch (error) {
        return toolErrorResult(error);
      }
    },
  );
}
