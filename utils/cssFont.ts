/**
 * Builds @font-face rules from guide-font names and URLs, which come from script and
 * project files. Both values are written as escaped CSS strings so they can't close the
 * string and inject other CSS, and only http(s), data: and blob: URLs are accepted.
 */

/** Quote `value` as a CSS string, escaping backslashes, quotes and line breaks. */
export const cssString = (value: string): string =>
    '"' + value.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, ' ') + '"';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:']);

/** The absolute URL if it's safe to load a font from, otherwise null. */
export const safeFontUrl = (url: string): string | null => {
    try {
        // Relative URLs resolve against the page (falls back to a dummy base outside a browser).
        const parsed = new URL(url, globalThis.location?.href ?? 'http://localhost/');
        return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
};

/** An @font-face rule, or null when the URL isn't acceptable. */
export const fontFaceRule = (fontName: string, fontUrl: string, format?: string): string | null => {
    const url = safeFontUrl(fontUrl);
    if (!fontName || !url) return null;
    const src = `url(${cssString(url)})` + (format ? ` format(${cssString(format)})` : '');
    return `@font-face { font-family: ${cssString(fontName)}; src: ${src}; font-display: swap; }`;
};
