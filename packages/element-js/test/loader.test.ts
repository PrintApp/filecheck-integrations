import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilecheckStatic } from '../src/types/index.js';

const SCRIPT_SELECTOR = 'script[src^="https://cdn.filecheck.io/element/"]';

function makeFilecheckStub(): FilecheckStatic {
  const factory = vi.fn((publishableKey: string, options?: unknown) => ({
    elements: { create: vi.fn() },
    __publishableKey: publishableKey,
    __options: options,
  }));
  (factory as unknown as { mount: unknown }).mount = vi.fn();
  return factory as unknown as FilecheckStatic;
}

async function importLoader() {
  return await import('../src/shared.js');
}

function queryScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR));
}

function fireLoad(script: HTMLScriptElement, stub?: FilecheckStatic): void {
  if (stub) window.Filecheck = stub;
  script.dispatchEvent(new Event('load'));
}

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.Filecheck = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadFilecheck', () => {
  it('injects the script once and resolves with a Filecheck instance', async () => {
    const { loadFilecheck, DEFAULT_SCRIPT_URL } = await importLoader();
    const stub = makeFilecheckStub();

    const promise = loadFilecheck('pk_test123');
    const scripts = queryScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(DEFAULT_SCRIPT_URL);
    expect(scripts[0]?.async).toBe(true);

    fireLoad(scripts[0] as HTMLScriptElement, stub);
    const instance = await promise;
    expect(instance).not.toBeNull();
    expect(stub).toHaveBeenCalledWith('pk_test123', {});
  });

  it('injects exactly one script tag for two parallel calls', async () => {
    const { loadFilecheck } = await importLoader();
    const stub = makeFilecheckStub();

    const a = loadFilecheck('pk_a');
    const b = loadFilecheck('pk_b');
    expect(queryScripts()).toHaveLength(1);

    fireLoad(queryScripts()[0] as HTMLScriptElement, stub);
    await Promise.all([a, b]);
    expect(queryScripts()).toHaveLength(1);
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('reuses a script tag that already exists on the page', async () => {
    const existing = document.createElement('script');
    existing.src = 'https://cdn.filecheck.io/element/v1/filecheck.js';
    document.head.appendChild(existing);

    const { loadFilecheck } = await importLoader();
    const stub = makeFilecheckStub();
    const promise = loadFilecheck('pk_test123');

    expect(queryScripts()).toHaveLength(1);
    fireLoad(existing, stub);
    await expect(promise).resolves.not.toBeNull();
  });

  it('resolves immediately when window.Filecheck already exists', async () => {
    const stub = makeFilecheckStub();
    window.Filecheck = stub;

    const { loadFilecheck } = await importLoader();
    const instance = await loadFilecheck('pk_test123');
    expect(instance).not.toBeNull();
    expect(queryScripts()).toHaveLength(0);
  });

  it('passes agentId and iframeSrc through to the factory', async () => {
    const stub = makeFilecheckStub();
    window.Filecheck = stub;

    const { loadFilecheck } = await importLoader();
    await loadFilecheck('pk_test123', {
      agentId: 'agt_1',
      iframeSrc: 'https://staging.example/index.html',
      scriptUrl: 'https://cdn.filecheck.io/element/v1/filecheck.js',
      loadTimeoutMs: 5,
    });
    expect(stub).toHaveBeenCalledWith('pk_test123', {
      agentId: 'agt_1',
      iframeSrc: 'https://staging.example/index.html',
    });
  });

  it('rejects when the script fails to load, then allows a retry', async () => {
    const { loadFilecheck } = await importLoader();

    const failing = loadFilecheck('pk_test123');
    queryScripts()[0]?.dispatchEvent(new Event('error'));
    await expect(failing).rejects.toThrow(/failed to load/);

    // Retry succeeds with a fresh promise.
    const stub = makeFilecheckStub();
    const retry = loadFilecheck('pk_test123');
    fireLoad(queryScripts()[0] as HTMLScriptElement, stub);
    await expect(retry).resolves.not.toBeNull();
  });

  it('rejects when the script loads but the global is missing', async () => {
    const { loadFilecheck } = await importLoader();
    const promise = loadFilecheck('pk_test123');
    // load fires without window.Filecheck being set
    queryScripts()[0]?.dispatchEvent(new Event('load'));
    await expect(promise).rejects.toThrow(/window\.Filecheck is not defined/);
  });

  it('rejects after the load timeout', async () => {
    vi.useFakeTimers();
    const { loadFilecheck } = await importLoader();
    const promise = loadFilecheck('pk_test123', { loadTimeoutMs: 1000 });
    const expectation = expect(promise).rejects.toThrow(/timed out after 1000ms/);
    vi.advanceTimersByTime(1001);
    await expectation;
  });

  it('rejects on a missing publishable key', async () => {
    const { loadFilecheck } = await importLoader();
    await expect(loadFilecheck('')).rejects.toThrow(/publishable key/);
  });
});
