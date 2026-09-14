import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the participant has asked iOS/Android to reduce motion.
 *
 * Read once on mount and kept in sync with the system setting. Defaults to
 * `false` until the first read resolves, which is the safe default for a
 * loader that must still play its mandatory sequence either way — reduced
 * motion drops the pulsing and cross-fades, not the frames.
 */
export default function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!cancelled) setReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduce;
}
