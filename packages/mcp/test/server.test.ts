import { describe, expect, it } from 'vitest';
import { LOCAL_CAPABILITIES, REMOTE_CAPABILITIES } from '../src/capabilities.js';
import { connectHarness } from './helpers/mcp-client.js';

const LOCAL_TOOLS = [
  'check_file',
  'fix_file',
  'validate_pdf',
  'optimize_file',
  'render_previews',
  'get_job',
  'list_jobs',
  'delete_job',
  'list_catalog',
  'get_report',
  'save_artifact',
];

describe('createFilecheckMcp registration', () => {
  it('registers the full local tool set', async () => {
    const harness = await connectHarness([], LOCAL_CAPABILITIES);
    const { tools } = await harness.mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...LOCAL_TOOLS].sort());
    await harness.close();
  });

  it('remote capabilities hide save_artifact and the filePath source field', async () => {
    const harness = await connectHarness([], REMOTE_CAPABILITIES);
    const { tools } = await harness.mcp.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('save_artifact');
    expect(names).toHaveLength(LOCAL_TOOLS.length - 1);

    const check = tools.find((t) => t.name === 'check_file');
    const source = (check?.inputSchema as any).properties.source;
    expect(Object.keys(source.properties)).not.toContain('filePath');
    expect(source.description).toContain('npx filecheck-mcp');
    await harness.close();
  });

  it('local check_file exposes filePath', async () => {
    const harness = await connectHarness([], LOCAL_CAPABILITIES);
    const { tools } = await harness.mcp.listTools();
    const check = tools.find((t) => t.name === 'check_file');
    expect(Object.keys((check?.inputSchema as any).properties.source.properties)).toContain(
      'filePath',
    );
    await harness.close();
  });

  it('annotates read-only and destructive tools', async () => {
    const harness = await connectHarness([], LOCAL_CAPABILITIES);
    const { tools } = await harness.mcp.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get('get_job')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('list_catalog')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('delete_job')?.annotations?.destructiveHint).toBe(true);
    expect(byName.get('check_file')?.annotations?.readOnlyHint).toBe(false);
    await harness.close();
  });
});
