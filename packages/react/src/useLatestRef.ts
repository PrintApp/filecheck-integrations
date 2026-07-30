import { useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * A ref that always holds the latest render's value. Lets event
 * subscriptions read fresh callback props without re-subscribing when a
 * callback identity changes (the "latest ref" pattern).
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
