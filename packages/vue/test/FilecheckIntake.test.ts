import { renderToString } from '@vue/server-renderer';
import { mount } from '@vue/test-utils';
import { describe, expect, it, type vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { createSSRApp } from 'vue';
import { FilecheckIntake, FilecheckPlugin } from '../src/index.js';
// The react package's mock is framework-agnostic; keep a local copy to avoid
// cross-package test imports.
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

function mountIntake(props: Record<string, unknown> = {}) {
  const { instance, created } = createMockInstance();
  const wrapper = mount(FilecheckIntake, {
    props,
    global: {
      plugins: [[FilecheckPlugin, { filecheck: instance }]],
    },
  });
  return { wrapper, instance, created };
}

describe('FilecheckIntake (vue)', () => {
  it('creates, subscribes before mount, and mounts one element', () => {
    const { created } = mountIntake({ workflowId: 'wf_1' });
    expect(created).toHaveLength(1);
    const el = created[0]!;
    expect(el.createOptions.workflowId).toBe('wf_1');
    expect(el.mounted).toBe(true);
    const onOrder = (el.on as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const mountOrder = (el.mount as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    expect(onOrder).toBeLessThan(mountOrder);
  });

  it('re-emits element events Vue-style', async () => {
    const { wrapper, created } = mountIntake({ workflowId: 'wf_1' });
    const el = created[0]!;
    el.emit('ready', { ui: {} as never });
    el.emit('status', statusPayload());
    el.emit('error', { code: 'validate_failed', message: 'nope' });
    await nextTick();

    expect(wrapper.emitted('ready')).toHaveLength(1);
    expect(wrapper.emitted('status')).toHaveLength(1);
    expect(wrapper.emitted('status')![0]![0]).toEqual(statusPayload());
    expect(wrapper.emitted('error')![0]![0]).toEqual({
      code: 'validate_failed',
      message: 'nope',
    });
  });

  it('emits update:jobId from status events (v-model:jobId)', async () => {
    const { wrapper, created } = mountIntake({ workflowId: 'wf_1' });
    created[0]!.emit('status', statusPayload({ jobId: 'job_9' }));
    await nextTick();
    expect(wrapper.emitted('update:jobId')).toEqual([['job_9']]);
  });

  it('does not recreate when the jobId prop echoes our own emit', async () => {
    const Parent = defineComponent({
      setup() {
        const jobId = ref<string | undefined>(undefined);
        return { jobId };
      },
      render() {
        return h(FilecheckIntake, {
          workflowId: 'wf_1',
          jobId: this.jobId,
          'onUpdate:jobId': (value: string) => {
            this.jobId = value;
          },
        });
      },
    });

    const { instance, created } = createMockInstance();
    mount(Parent, { global: { plugins: [[FilecheckPlugin, { filecheck: instance }]] } });
    expect(created).toHaveLength(1);

    created[0]!.emit('status', statusPayload({ jobId: 'job_42' }));
    await nextTick();
    await nextTick();
    // v-model echo must NOT recreate the element
    expect(created).toHaveLength(1);
    expect(created[0]!.unmount).not.toHaveBeenCalled();
  });

  it('recreates when jobId is changed externally', async () => {
    const { wrapper, created } = mountIntake({ workflowId: 'wf_1', jobId: 'job_1' });
    await wrapper.setProps({ jobId: 'job_2' });
    expect(created).toHaveLength(2);
    expect(created[0]!.unmount).toHaveBeenCalledTimes(1);
    expect(created[1]!.createOptions.jobId).toBe('job_2');
    expect(created[1]!.mounted).toBe(true);
  });

  it('applies ui/locale/workflowId changes via update() without recreating', async () => {
    const { wrapper, created } = mountIntake({
      workflowId: 'wf_1',
      ui: { title: 'A' },
      locale: 'en-US',
    });
    const el = created[0]!;

    await wrapper.setProps({ workflowId: 'wf_2', ui: { title: 'B' }, locale: 'de-DE' });
    expect(created).toHaveLength(1);
    expect(el.update).toHaveBeenCalledTimes(1);
    expect(el.update).toHaveBeenCalledWith({
      ui: { title: 'B' },
      locale: 'de-DE',
      workflowId: 'wf_2',
    });
  });

  it('routes connector changes through setConnector()', async () => {
    const { wrapper, created } = mountIntake({
      workflowId: 'wf_1',
      connector: { bindings: [{ id: 'b1', source: 'pageCount' as const }] },
    });
    const el = created[0]!;
    const next = { bindings: [{ id: 'b2', source: 'width' as const }] };
    await wrapper.setProps({ connector: next });
    expect(created).toHaveLength(1);
    expect(el.setConnector).toHaveBeenCalledWith(next);
  });

  it('tears down on unmount', () => {
    const { wrapper, created } = mountIntake({ workflowId: 'wf_1' });
    wrapper.unmount();
    expect(created[0]!.unmount).toHaveBeenCalledTimes(1);
  });

  it('exposes the element and focus/blur via template ref', () => {
    const { wrapper, created } = mountIntake({ workflowId: 'wf_1' });
    const exposed = wrapper.vm as unknown as {
      element: { value: unknown } | unknown;
      focus: () => void;
      respondToProof: (approved: boolean) => void;
    };
    exposed.focus();
    exposed.respondToProof(true);
    expect(created[0]!.focus).toHaveBeenCalled();
    expect(created[0]!.respondToProof).toHaveBeenCalledWith(true);
  });

  it('creates the element once a late-resolving factory arrives', async () => {
    const { instance, created } = createMockInstance();
    let resolve!: (value: typeof instance) => void;
    const promise = new Promise<typeof instance>((r) => {
      resolve = r;
    });

    mount(FilecheckIntake, {
      props: { workflowId: 'wf_1' },
      global: { plugins: [[FilecheckPlugin, { filecheck: promise }]] },
    });
    expect(created).toHaveLength(0);

    resolve(instance);
    await promise;
    await nextTick();
    expect(created).toHaveLength(1);
    expect(created[0]!.mounted).toBe(true);
  });

  it('renders on the server without touching the element factory', async () => {
    const app = createSSRApp({
      render: () => h(FilecheckIntake, { workflowId: 'wf_1' }),
    });
    app.use(FilecheckPlugin, { publishableKey: 'pk_test123' });
    const html = await renderToString(app);
    expect(html).toContain('<div');
  });
});
