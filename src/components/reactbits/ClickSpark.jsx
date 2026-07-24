import { useRef, useEffect, useCallback } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';

/*
 * React Bits — ClickSpark (https://reactbits.dev). MIT.
 * Radial spark burst at the click position.
 *
 * [petquest] Adaptations, so one instance can wrap the whole app:
 *   - The canvas is viewport-fixed instead of sized to the parent element.
 *     Upstream matches the parent's box, which for an app-level wrapper means
 *     allocating (and clearing every frame) a canvas as tall as the whole
 *     scrolling page. Fixed to the viewport it stays one screen big, and the
 *     click maths is unchanged: the canvas rect is the viewport, so
 *     `clientX - rect.left` is still the correct local coordinate.
 *   - Backing store scaled by devicePixelRatio, otherwise a full-viewport
 *     canvas renders soft on high-DPI screens.
 *   - The render loop idles when there are no live sparks rather than
 *     clearing an empty canvas 60 times a second forever.
 *   - Reduced motion emits no sparks.
 */
const ClickSpark = ({
  sparkColor = '#fff',
  sparkSize = 10,
  sparkRadius = 15,
  sparkCount = 8,
  duration = 400,
  easing = 'ease-out',
  extraScale = 1.0,
  className = '', // [petquest] lets the caller size the wrapper
  children
}) => {
  const canvasRef = useRef(null);
  const sparksRef = useRef([]);
  const reduceMotion = useReducedMotion(); // [petquest]

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let resizeTimeout;

    // [petquest] Track the viewport, not the parent element.
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    };

    resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  const easeFunc = useCallback(
    t => {
      switch (easing) {
        case 'linear':
          return t;
        case 'ease-in':
          return t * t;
        case 'ease-in-out':
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
          return t * (2 - t);
      }
    },
    [easing]
  );

  /* [petquest] The loop is started by a click and stops once the last spark
     has expired, instead of running unconditionally for the app's lifetime. */
  const rafRef = useRef(null);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = timestamp => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      sparksRef.current = sparksRef.current.filter(spark => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) {
          return false;
        }

        const progress = elapsed / duration;
        const eased = easeFunc(progress);

        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        return true;
      });

      if (sparksRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(draw);
  }, [sparkColor, sparkSize, sparkRadius, duration, easeFunc, extraScale]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const handleClick = e => {
    if (reduceMotion) return; // [petquest]
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const now = performance.now();
    const newSparks = Array.from({ length: sparkCount }, (_, i) => ({
      x,
      y,
      angle: (2 * Math.PI * i) / sparkCount,
      startTime: now
    }));

    sparksRef.current.push(...newSparks);
    startLoop();
  };

  return (
    <div className={`relative w-full ${className}`} onClick={handleClick}>
      <canvas
        ref={canvasRef}
        className="block fixed top-0 left-0 select-none pointer-events-none"
        style={{ zIndex: 10001 }}
      />
      {children}
    </div>
  );
};

export default ClickSpark;
