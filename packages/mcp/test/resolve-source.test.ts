import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Filecheck } from 'filecheck-node';
import { describe, expect, it, vi } from 'vitest';
import { LOCAL_CAPABILITIES, REMOTE_CAPABILITIES } from '../src/capabilities.js';
import { resolveSource } from '../src/resolve-source.js';

function stubUploads() {
  const create = vi.fn(async () => ({
    fileRef: 'upload_test1',
    maxBytes: 500_000_000,
    expiresIn: 300,
  }));
  return { client: { uploads: { create } } as unknown as Filecheck, create };
}

describe('resolveSource', () => {
  it('requires exactly one locator', async () => {
    const { client } = stubUploads();
    await expect(resolveSource(client, LOCAL_CAPABILITIES, {})).rejects.toThrow(/exactly one of/);
    await expect(
      resolveSource(client, LOCAL_CAPABILITIES, {
        url: 'https://example.com/a.pdf',
        fileRef: 'upload_x',
      }),
    ).rejects.toThrow(/url \+ fileRef/);
  });

  it('passes url sources through with headers', async () => {
    const { client, create } = stubUploads();
    const ref = await resolveSource(client, REMOTE_CAPABILITIES, {
      url: 'https://example.com/a.pdf',
      headers: { Authorization: 'Bearer t' },
    });
    expect(ref).toEqual({
      url: 'https://example.com/a.pdf',
      headers: { Authorization: 'Bearer t' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('uploads a filePath and returns the fileRef', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fc-mcp-'));
    const filePath = join(dir, 'card.pdf');
    await writeFile(filePath, '%PDF-1.4 test');

    const { client, create } = stubUploads();
    const ref = await resolveSource(client, LOCAL_CAPABILITIES, { filePath });
    expect(ref).toEqual({ fileRef: 'upload_test1', name: 'card.pdf' });
    expect(create).toHaveBeenCalledWith(expect.anything(), {
      fileName: 'card.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('errors clearly on a missing file', async () => {
    const { client } = stubUploads();
    await expect(
      resolveSource(client, LOCAL_CAPABILITIES, {
        filePath: join(tmpdir(), 'nope-does-not-exist.pdf'),
      }),
    ).rejects.toThrow(/not found/);
  });
});
