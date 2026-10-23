import { useEffect, useRef, useState } from 'react';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Eases toward `target` (ease-out cubic). Retargeting mid-flight starts from
 * the current on-screen value, so fast scrubbing glides instead of jumping.
 */
export function useAnimatedNumber(target: number, durationMs = 260): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (current.current === target) return;
    const from = current.current;
    const start = now();
    const step = () => {
      const t = Math.min(1, (now() - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = t >= 1 ? target : from + (target - from) * eased;
      current.current = next;
      setValue(next);
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [durationMs, target]);

  return value;
}
