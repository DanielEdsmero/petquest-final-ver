import useReducedMotion from '../../hooks/useReducedMotion';

/*
 * React Bits — StarBorder (https://reactbits.dev). MIT.
 * A light travels around the border of the element.
 *
 * Needs the `star-movement-top` / `star-movement-bottom` keyframes, which
 * upstream ships commented out at the bottom of the file; they live in
 * `tailwind.config.js` instead.
 *
 * [petquest] Adaptations:
 *   - `innerClassName` / `innerStyle`. Upstream hardcodes a black-to-gray inner
 *     panel with white text, which fights this app's gold/arcane palette. The
 *     defaults are unchanged, so the upstream look is still what you get if you
 *     pass nothing.
 *   - Reduced motion parks the travelling lights.
 */
const StarBorder = ({
  as: Component = 'button',
  className = '',
  color = 'white',
  speed = '6s',
  thickness = 1,
  innerClassName = 'text-center rounded-[20px] bg-gradient-to-b from-black to-gray-900 border border-gray-800 text-white text-[16px] py-[16px] px-[26px]', // [petquest]
  innerStyle, // [petquest]
  style, // [petquest] see below
  children,
  ...rest
}) => {
  const reduceMotion = useReducedMotion(); // [petquest]

  return (
    <Component
      className={`relative inline-block overflow-hidden rounded-[20px] ${className}`}
      /* [petquest] Upstream reads `rest.style` into this object and then
         spreads `{...rest}` after it, so a caller-supplied `style` replaces
         the whole thing and the border thickness silently disappears.
         Pulling `style` out of rest and merging it here fixes that. */
      style={{
        padding: `${thickness}px 0`,
        ...style
      }}
      {...rest}
    >
      <div
        className="absolute w-[300%] h-[50%] opacity-70 bottom-[-11px] right-[-250%] rounded-full animate-star-movement-bottom z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
          animationPlayState: reduceMotion ? 'paused' : 'running' // [petquest]
        }}
      ></div>
      <div
        className="absolute w-[300%] h-[50%] opacity-70 top-[-10px] left-[-250%] rounded-full animate-star-movement-top z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animationDuration: speed,
          animationPlayState: reduceMotion ? 'paused' : 'running' // [petquest]
        }}
      ></div>
      <div
        className={`relative z-1 ${innerClassName}`}
        style={innerStyle}
      >
        {children}
      </div>
    </Component>
  );
};

export default StarBorder;
