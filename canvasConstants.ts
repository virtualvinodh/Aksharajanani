// Plain .ts (no JSX/React) so it can be imported from Web Workers. In dev, @vitejs/plugin-react
// injects React Fast Refresh code that references `window` into every .tsx module, which throws
// inside a worker. constants.tsx re-exports this for everything else.

/** Width/height of the glyph drawing canvas, in canvas units. */
export const DRAWING_CANVAS_SIZE = 1000;

/** Ink-blue accent for canvas selection, handles and active guides (matches --color-accent in index.css). */
export const ACCENT = { light: '#1F4B99', dark: '#7EA6E8' } as const;
export const accentFor = (theme: 'light' | 'dark'): string => ACCENT[theme];
