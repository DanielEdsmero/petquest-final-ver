# React Bits components

Vendored from [React Bits](https://reactbits.dev) (MIT), `JS-TW` variant, pulled
from the official shadcn registry at `https://reactbits.dev/r/<Name>-JS-TW.json`.

They are checked in rather than installed because React Bits is a copy-paste
library: its CLI (`npx shadcn@latest add @react-bits/<Name>-JS-TW`) expects a
shadcn project — `components.json`, the `@/` alias, its CSS-variable theme —
none of which this app has. Vendoring keeps the sources honest and editable.

Two project-wide edits are applied to every file, marked `// [petquest]`:

1. **`motion/react` → `framer-motion`.** Upstream depends on `motion@^12`, the
   renamed successor to `framer-motion`. This app is on `framer-motion@11`,
   which exports every hook these components use. Installing `motion` too would
   have shipped both copies of the same library in one bundle.
2. **Reduced motion.** Upstream animates unconditionally. Each component now
   calls the app's `useReducedMotion()` hook and renders its resting state when
   the user has asked the OS to reduce motion, matching the rest of the app.

Per-component adaptations beyond those two are noted in each file's header.

`StarBorder` also needs the `star-movement-top` / `star-movement-bottom`
keyframes, which upstream ships as a commented-out block; they live in
`tailwind.config.js`.
