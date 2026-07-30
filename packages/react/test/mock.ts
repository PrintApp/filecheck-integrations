import type {
  ElementEventMap,
  ElementEventName,
  FilecheckInstance,
  FilecheckIntakeElement,
  IntakeElementOptions,
} from '@filecheck/element-js';
import { vi } from 'vitest';

type Handler = (payload?: unknown) => void;

export interface MockIntakeElement extends FilecheckIntakeElement {
  emit<K extends ElementEventName>(event: K, payload?: ElementEventMap[K]): void;
  handlerCount(event: ElementEventName): number;
  mounted: boolean;
  createOptions: IntakeElementOptions;
}

export function createMockInstance() {
  const created: MockIntakeElement[] = [];

  const instance: FilecheckInstance = {
    elements: {
      create: vi.fn((type: string, options: any = {}) => {
        const handlers = new Map<string, Handler[]>();
        const element = {
          id: `el_${created.length + 1}`,
          type,
          createOptions: options,
          mounted: false,
          mount: vi.fn(function (this: MockIntakeElement) {
            if (element.mounted) throw new Error('[filecheck-element] already mounted');
            element.mounted = true;
            return element;
          }),
          update: vi.fn(() => element),
          focus: vi.fn(),
          blur: vi.fn(),
          respondToProof: vi.fn(),
          unmount: vi.fn(() => {
            element.mounted = false;
            handlers.clear();
          }),
          setConnector: vi.fn(() => element),
          applyNow: vi.fn(() => []),
          on: vi.fn((event: string, handler: Handler) => {
            const list = handlers.get(event) ?? [];
            list.push(handler);
            handlers.set(event, list);
            return () => element.off(event as ElementEventName, handler as never);
          }),
          off: vi.fn((event: string, handler: Handler) => {
            const list = handlers.get(event) ?? [];
            handlers.set(
              event,
              list.filter((h) => h !== handler),
            );
          }),
          emit: (event: string, payload?: unknown) => {
            for (const handler of handlers.get(event) ?? []) handler(payload);
          },
          handlerCount: (event: string) => (handlers.get(event) ?? []).length,
        } as unknown as MockIntakeElement;
        created.push(element);
        return element;
      }),
    },
  } as unknown as FilecheckInstance;

  return { instance, created };
}
