// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadFilecheck } from '../src/shared.js';

describe('loadFilecheck (SSR)', () => {
  it('resolves null when window is undefined', async () => {
    expect(typeof window).toBe('undefined');
    await expect(loadFilecheck('pk_test123')).resolves.toBeNull();
  });
});
