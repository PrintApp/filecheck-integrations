import type {
  AppliedBinding,
  ConnectorConfig,
  DownloadPayload,
  ErrorPayload,
  FileSelectPayload,
  FilecheckIntakeElement,
  IntakeFacts,
  IntakeStatusPayload,
  IntakeUi,
  IntakeUiOverride,
  Presentation,
  ProofPayload,
} from 'filecheck-js';
import {
  computed,
  defineComponent,
  h,
  markRaw,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type { PropType } from 'vue';
import { useFilecheck } from './plugin.js';

function stableKey(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

interface AppliedMutable {
  uiKey: string | undefined;
  locale: string | null | undefined;
  workflowId: string | undefined;
}

/**
 * Mounts a Filecheck intake element into a slot `<div>`.
 *
 * - Identity props (`jobId`, `presentation`, `connectorId`, `preview`,
 *   `workflow`) recreate the element when they change (instances are
 *   single-use). `v-model:jobId` echoes from `status` events never trigger a
 *   recreate.
 * - Mutable props (`ui`, `locale`, `workflowId`) go through
 *   `element.update()`; `connector` through `element.setConnector()`.
 * - Events are re-emitted Vue-style: `@ready`, `@status`, `@facts`, `@ui`,
 *   `@error`, `@proof`, `@file-select`, `@download`, `@destroy`,
 *   `@connector-apply`, plus `@update:jobId` for `v-model:jobId`.
 */
export const FilecheckIntake = defineComponent({
  name: 'FilecheckIntake',
  props: {
    workflowId: { type: String, required: false, default: undefined },
    jobId: { type: String, required: false, default: undefined },
    presentation: {
      type: String as PropType<Presentation>,
      required: false,
      default: undefined,
    },
    locale: { type: String as PropType<string | null>, required: false, default: undefined },
    ui: { type: Object as PropType<IntakeUiOverride>, required: false, default: undefined },
    connector: {
      type: Object as PropType<ConnectorConfig | null>,
      required: false,
      default: undefined,
    },
    connectorId: { type: String, required: false, default: undefined },
    preview: { type: Boolean, required: false, default: undefined },
    workflow: {
      type: Object as PropType<Record<string, unknown>>,
      required: false,
      default: undefined,
    },
  },
  emits: {
    /* eslint-disable @typescript-eslint/no-unused-vars -- payload validators */
    ready: (_payload: { ui: IntakeUi }) => true,
    status: (_payload: IntakeStatusPayload) => true,
    facts: (_payload: IntakeFacts) => true,
    ui: (_payload: IntakeUi) => true,
    error: (_payload: ErrorPayload) => true,
    proof: (_payload: ProofPayload) => true,
    fileSelect: (_payload: FileSelectPayload) => true,
    download: (_payload: DownloadPayload) => true,
    destroy: () => true,
    connectorApply: (_results: AppliedBinding[]) => true,
    'update:jobId': (_jobId: string) => true,
    /* eslint-enable @typescript-eslint/no-unused-vars */
  },
  setup(props, { emit, expose }) {
    const fc = useFilecheck();
    const host = ref<HTMLDivElement | null>(null);
    const element = shallowRef<FilecheckIntakeElement | null>(null);

    let applied: AppliedMutable | null = null;
    let lastEmittedJobId: string | null = null;

    const uiKey = computed(() => stableKey(props.ui));
    const workflowKey = computed(() => stableKey(props.workflow));
    const connectorKey = computed(() => stableKey(props.connector));

    function createElement(): void {
      const factory = fc.value;
      if (!factory || !host.value || element.value) return;

      const el = factory.elements.create('intake', {
        workflowId: props.workflowId,
        jobId: props.jobId,
        presentation: props.presentation,
        locale: props.locale,
        ui: props.ui,
        connector: props.connector ?? undefined,
        connectorId: props.connectorId,
        preview: props.preview,
        workflow: props.workflow,
        onConnectorApply: (results) => emit('connectorApply', results),
      });

      // Subscribe before mount so `ready` can never be missed.
      el.on('ready', (payload) => emit('ready', payload));
      el.on('status', (payload) => {
        if (payload.jobId && payload.jobId !== props.jobId) {
          lastEmittedJobId = payload.jobId;
          emit('update:jobId', payload.jobId);
        }
        emit('status', payload);
      });
      el.on('facts', (payload) => emit('facts', payload));
      el.on('ui', (payload) => emit('ui', payload));
      el.on('error', (payload) => emit('error', payload));
      el.on('proof', (payload) => emit('proof', payload));
      el.on('fileSelect', (payload) => emit('fileSelect', payload));
      el.on('download', (payload) => emit('download', payload));
      el.on('destroy', () => emit('destroy'));

      el.mount(host.value);
      element.value = markRaw(el);
      applied = { uiKey: uiKey.value, locale: props.locale, workflowId: props.workflowId };
    }

    function destroyElement(): void {
      const el = element.value;
      element.value = null;
      applied = null;
      el?.unmount();
    }

    function recreate(): void {
      destroyElement();
      createElement();
    }

    // Element creation only happens client-side (onMounted never runs during
    // SSR), and the factory may resolve after mount — cover both orders.
    onMounted(createElement);
    watch(fc, () => {
      if (!element.value) createElement();
    });
    onUnmounted(destroyElement);

    // Identity props → recreate. A jobId change that merely echoes our own
    // `update:jobId` emit (v-model writing back) must not recreate.
    watch(
      [
        () => props.jobId,
        () => props.presentation,
        () => props.connectorId,
        () => props.preview,
        workflowKey,
      ],
      (next, prev) => {
        const othersChanged = next.slice(1).some((value, i) => value !== prev[i + 1]);
        if (!othersChanged && next[0] === lastEmittedJobId) return;
        recreate();
      },
    );

    // Mutable props → update(). `applied` tracks what the element last
    // received so the pass right after (re)creation is a no-op.
    watch([uiKey, () => props.locale, () => props.workflowId], () => {
      const el = element.value;
      if (!el || !applied) return;
      const patch: { ui?: IntakeUiOverride; locale?: string | null; workflowId?: string } = {};
      if (uiKey.value !== applied.uiKey && props.ui !== undefined) patch.ui = props.ui;
      if (props.locale !== applied.locale && props.locale !== undefined) {
        patch.locale = props.locale;
      }
      if (props.workflowId !== applied.workflowId && props.workflowId !== undefined) {
        patch.workflowId = props.workflowId;
      }
      if (Object.keys(patch).length === 0) return;
      el.update(patch);
      applied = { uiKey: uiKey.value, locale: props.locale, workflowId: props.workflowId };
    });

    // connector → setConnector(), never recreates.
    watch(connectorKey, () => {
      element.value?.setConnector(props.connector ?? null);
    });

    expose({
      element,
      focus: () => element.value?.focus(),
      blur: () => element.value?.blur(),
      respondToProof: (approved: boolean) => element.value?.respondToProof(approved),
    });

    return () => h('div', { ref: host });
  },
});
