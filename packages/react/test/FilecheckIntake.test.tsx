import { render } from '@testing-library/react';
import { StrictMode, createRef, useState } from 'react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilecheckIntake, FilecheckProvider, useFilecheck } from '../src/index.js';
import type { FilecheckIntakeRef } from '../src/index.js';
import { createMockInstance } from './mock.js';

function statusPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready' as const,
    terminal: true,
    canProceed: true,
    workflowId: 'wf_1',
    jobId: 'job_1',
    files: [],
    ...overrides,
  };
}

describe('FilecheckIntake', () => {
  it('creates, subscribes before mount, and mounts exactly one element', () => {
    const { instance, created } = createMockInstance();
    render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" />
      </FilecheckProvider>,
    );

    expect(created).toHaveLength(1);
    const el = created[0]!;
    expect(el.createOptions.workflowId).toBe('wf_1');
    expect(el.mounted).toBe(true);
    // on() must be called before mount()
    const onOrder = (el.on as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const mountOrder = (el.mount as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(onOrder).toBeLessThan(mountOrder);
  });

  it('survives StrictMode double-mount with exactly one live element', () => {
    const { instance, created } = createMockInstance();
    render(
      <StrictMode>
        <FilecheckProvider filecheck={instance}>
          <FilecheckIntake workflowId="wf_1" />
        </FilecheckProvider>
      </StrictMode>,
    );

    // StrictMode: create → mount → unmount → create → mount
    expect(created).toHaveLength(2);
    expect(created[0]!.unmount).toHaveBeenCalledTimes(1);
    expect(created[0]!.mounted).toBe(false);
    expect(created[1]!.mounted).toBe(true);
  });

  it('applies ui/locale/workflowId changes via update() without recreating', () => {
    const { instance, created } = createMockInstance();
    const { rerender } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" ui={{ title: 'A' }} locale="en-US" />
      </FilecheckProvider>,
    );

    expect(created).toHaveLength(1);
    const el = created[0]!;
    expect(el.update).not.toHaveBeenCalled();

    rerender(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_2" ui={{ title: 'B' }} locale="de-DE" />
      </FilecheckProvider>,
    );

    expect(created).toHaveLength(1); // no recreate
    expect(el.update).toHaveBeenCalledTimes(1);
    expect(el.update).toHaveBeenCalledWith({
      ui: { title: 'B' },
      locale: 'de-DE',
      workflowId: 'wf_2',
    });
  });

  it('does not call update() when an inline ui literal is value-equal', () => {
    const { instance, created } = createMockInstance();
    const { rerender } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" ui={{ title: 'Same' }} />
      </FilecheckProvider>,
    );
    rerender(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" ui={{ title: 'Same' }} />
      </FilecheckProvider>,
    );
    expect(created[0]!.update).not.toHaveBeenCalled();
  });

  it('recreates the element when jobId changes', () => {
    const { instance, created } = createMockInstance();
    const { rerender } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake jobId="job_1" />
      </FilecheckProvider>,
    );
    rerender(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake jobId="job_2" />
      </FilecheckProvider>,
    );

    expect(created).toHaveLength(2);
    expect(created[0]!.unmount).toHaveBeenCalledTimes(1);
    expect(created[1]!.createOptions.jobId).toBe('job_2');
    expect(created[1]!.mounted).toBe(true);
  });

  it('routes connector changes through setConnector() without recreating', () => {
    const { instance, created } = createMockInstance();
    const connectorA = { bindings: [{ id: 'b1', source: 'pageCount' as const }] };
    const connectorB = { bindings: [{ id: 'b2', source: 'width' as const }] };
    const { rerender } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" connector={connectorA} />
      </FilecheckProvider>,
    );
    const el = created[0]!;
    expect(el.setConnector).not.toHaveBeenCalled();
    expect(el.createOptions.connector).toEqual(connectorA);

    rerender(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" connector={connectorB} />
      </FilecheckProvider>,
    );
    expect(created).toHaveLength(1);
    expect(el.setConnector).toHaveBeenCalledWith(connectorB);
  });

  it('always delivers events to the latest callback without re-subscribing', () => {
    const { instance, created } = createMockInstance();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" onStatus={first} />
      </FilecheckProvider>,
    );
    const el = created[0]!;
    const onCalls = (el.on as ReturnType<typeof vi.fn>).mock.calls.length;

    rerender(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" onStatus={second} />
      </FilecheckProvider>,
    );

    expect((el.on as ReturnType<typeof vi.fn>).mock.calls.length).toBe(onCalls);
    act(() => el.emit('status', statusPayload()));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(statusPayload());
  });

  it('unmounts the element on component unmount', () => {
    const { instance, created } = createMockInstance();
    const { unmount } = render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake workflowId="wf_1" />
      </FilecheckProvider>,
    );
    unmount();
    expect(created[0]!.unmount).toHaveBeenCalledTimes(1);
  });

  it('exposes the element instance and focus/blur through ref', () => {
    const { instance, created } = createMockInstance();
    const ref = createRef<FilecheckIntakeRef>();
    render(
      <FilecheckProvider filecheck={instance}>
        <FilecheckIntake ref={ref} workflowId="wf_1" />
      </FilecheckProvider>,
    );
    expect(ref.current?.element).toBe(created[0]);
    ref.current?.focus();
    ref.current?.respondToProof(true);
    expect(created[0]!.focus).toHaveBeenCalled();
    expect(created[0]!.respondToProof).toHaveBeenCalledWith(true);
  });

  it('waits for a promise-based provider and mounts once resolved', async () => {
    const { instance, created } = createMockInstance();
    let resolve!: (v: typeof instance) => void;
    const promise = new Promise<typeof instance>((r) => {
      resolve = r;
    });

    render(
      <FilecheckProvider filecheck={promise}>
        <FilecheckIntake workflowId="wf_1" />
      </FilecheckProvider>,
    );
    expect(created).toHaveLength(0);

    await act(async () => {
      resolve(instance);
      await promise;
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.mounted).toBe(true);
  });

  it('useFilecheck throws outside the provider', () => {
    function Bare() {
      useFilecheck();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/within a <FilecheckProvider>/);
    spy.mockRestore();
  });

  it('gates a submit button on canProceed (docs pattern)', () => {
    const { instance, created } = createMockInstance();
    function Checkout() {
      const [canProceed, setCanProceed] = useState(false);
      const [jobId, setJobId] = useState('');
      return (
        <FilecheckProvider filecheck={instance}>
          <FilecheckIntake
            workflowId="wf_1"
            onStatus={(s) => {
              setCanProceed(s.canProceed);
              setJobId(s.jobId ?? '');
            }}
          />
          <input type="hidden" data-testid="job" value={jobId} readOnly />
          <button type="submit" disabled={!canProceed} data-testid="submit">
            Add to cart
          </button>
        </FilecheckProvider>
      );
    }

    const { getByTestId } = render(<Checkout />);
    expect((getByTestId('submit') as HTMLButtonElement).disabled).toBe(true);

    act(() => created[0]!.emit('status', statusPayload()));
    expect((getByTestId('submit') as HTMLButtonElement).disabled).toBe(false);
    expect((getByTestId('job') as HTMLInputElement).value).toBe('job_1');
  });
});
