import { useInView, useMotionValue, useSpring } from 'framer-motion'; // [petquest] was 'motion/react'
import { useCallback, useEffect, useRef } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

/*
 * React Bits — CountUp (https://reactbits.dev). MIT.
 * Animated number counter supporting formatting and decimals.
 *
 * [petquest] Adaptations:
 *   - Reduced motion prints the target value immediately.
 *   - A `suffix` prop, so "82%" / "12h" animate the number and keep the unit.
 */
export default function CountUp({
  to,
  from = 0,
  direction = 'up',
  delay = 0,
  duration = 2,
  className = '',
  startWhen = true,
  separator = '',
  suffix = '', // [petquest]
  animateOnMount = true, // [petquest] false = show `to` immediately, only animate on later changes (no 0-flash on remount)
  onStart,
  onEnd
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion(); // [petquest]
  // [petquest] When animateOnMount is false, seed at `to` so a remount (e.g. SPA
  // navigation back to the dashboard) shows the real value instantly instead of
  // counting up from 0. In-session changes to `to` still animate.
  const startFrom = animateOnMount ? from : to;
  const motionValue = useMotionValue(direction === 'down' ? to : startFrom);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);

  const springValue = useSpring(motionValue, {
    damping,
    stiffness
  });

  const isInView = useInView(ref, { once: true, margin: '0px' });

  const getDecimalPlaces = num => {
    const str = num.toString();

    if (str.includes('.')) {
      const decimals = str.split('.')[1];

      if (parseInt(decimals) !== 0) {
        return decimals.length;
      }
    }

    return 0;
  };

  const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback(
    latest => {
      const hasDecimals = maxDecimals > 0;

      const options = {
        useGrouping: !!separator,
        minimumFractionDigits: hasDecimals ? maxDecimals : 0,
        maximumFractionDigits: hasDecimals ? maxDecimals : 0
      };

      const formattedNumber = Intl.NumberFormat('en-US', options).format(latest);

      return (separator ? formattedNumber.replace(/,/g, separator) : formattedNumber) + suffix;
    },
    [maxDecimals, separator, suffix]
  );

  useEffect(() => {
    if (ref.current) {
      // [petquest] Reduced motion: settle on the target rather than the start value.
      ref.current.textContent = formatValue(reduceMotion ? to : direction === 'down' ? to : startFrom);
    }
  }, [from, to, direction, formatValue, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return; // [petquest]
    if (isInView && startWhen) {
      if (typeof onStart === 'function') onStart();

      const timeoutId = setTimeout(() => {
        motionValue.set(direction === 'down' ? from : to);
      }, delay * 1000);

      const durationTimeoutId = setTimeout(
        () => {
          if (typeof onEnd === 'function') onEnd();
        },
        delay * 1000 + duration * 1000
      );

      return () => {
        clearTimeout(timeoutId);
        clearTimeout(durationTimeoutId);
      };
    }
  }, [isInView, startWhen, motionValue, direction, from, to, delay, onStart, onEnd, duration, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return; // [petquest]
    const unsubscribe = springValue.on('change', latest => {
      if (ref.current) {
        ref.current.textContent = formatValue(latest);
      }
    });

    return () => unsubscribe();
  }, [springValue, formatValue, reduceMotion]);

  return <span className={className} ref={ref} />;
}
