// Plain .ts (no JSX/React) so it can be imported from Web Workers. In dev, @vitejs/plugin-react
// injects React Fast Refresh code that references `window` into every .tsx module, which throws
// inside a worker. constants.tsx re-exports this for everything else.

/** Width/height of the glyph drawing canvas, in canvas units. */
export const DRAWING_CANVAS_SIZE = 1000;
