import { useRef, useState } from 'react';

/*
 * React Bits — SpotlightCard (https://reactbits.dev). MIT.
 * A soft radial light follows the cursor across the card.
 *
 * [petquest] Adaptations:
 *   - `baseClassName`. Upstream hardcodes `rounded-3xl border-neutral-800
 *     bg-neutral-900 p-8` ahead of the caller's `className`; because Tailwind
 *     resolves conflicts by stylesheet order and not by prop order, passing
 *     `glass-card` alongside it is a coin toss. Overriding the base outright is
 *     the reliable way to reuse the app's card surface. The default is the
 *     upstream string, so passing nothing gives the upstream look.
 *
 * No reduced-motion guard: the spotlight tracks the pointer rather than
 * animating on its own, so there is no motion to suppress.
 */
const SpotlightCard = ({
  children,
  className = '',
  baseClassName = 'rounded-3xl border border-neutral-800 bg-neutral-900 p-8', // [petquest]
  spotlightColor = 'rgba(255, 255, 255, 0.25)',
  ...rest // [petquest] so callers can still pass style/handlers
}) => {
  const divRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = e => {
    if (!divRef.current || isFocused) return;

    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(0.6);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = () => {
    setOpacity(0.6);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden ${baseClassName} ${className}`}
      {...rest}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`
        }}
      />
      {children}
    </div>
  );
};

export default SpotlightCard;
