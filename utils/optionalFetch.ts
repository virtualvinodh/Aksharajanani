/**
 * Fetching for data files a script may or may not ship (`positioning_<id>.json`,
 * `rules_<id>.json`, `sample_<id>.txt`, ...). A missing file is normal, not an error.
 *
 * A 200 response does not mean the file exists: the Vite dev server and most static
 * hosts answer an unknown path with index.html (200, text/html). So a response only
 * counts as the file when it is OK and is not an HTML page.
 *
 * Required files (e.g. `characters_<id>.json`) should not use these helpers.
 */

const isHtmlResponse = (response: Response, body: string): boolean =>
    (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html') ||
    /^\s*<(!doctype\s+html|html[\s>])/i.test(body);

/** The file's text, or null when it is absent (network error, non-OK status, or HTML fallback page). */
export const fetchOptionalText = async (path: string): Promise<string | null> => {
    try {
        const response = await fetch(path);
        if (!response.ok) return null;
        const body = await response.text();
        return isHtmlResponse(response, body) ? null : body;
    } catch {
        return null;
    }
};

/**
 * The file parsed as JSON, or null when it is absent or empty. A file that exists but
 * isn't valid JSON is a data bug, so it is reported with a warning and treated as absent.
 */
export const fetchOptionalJson = async <T>(path: string): Promise<T | null> => {
    const body = await fetchOptionalText(path);
    if (body === null || body.trim() === '') return null;
    try {
        return JSON.parse(body) as T;
    } catch (err) {
        console.warn(`Ignoring malformed data file ${path}:`, err);
        return null;
    }
};
