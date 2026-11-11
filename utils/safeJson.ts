/**
 * Guards for data from user-supplied files (projects, custom scripts, rules).
 *
 * Plain objects are used as dictionaries throughout the app, keyed by names that come
 * from those files (feature tags, group names, ...). A key such as "__proto__" would
 * then write onto Object.prototype and corrupt every object in the app.
 */

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True when `key` can safely be used as a property name on a plain object. */
export const isSafeKey = (key: unknown): key is string =>
    typeof key === 'string' && !UNSAFE_KEYS.has(key);

/**
 * JSON.parse for user-supplied files. Drops "__proto__", "constructor" and "prototype"
 * keys at every depth. (JSON.parse keeps a "__proto__" key as an ordinary own property,
 * but a later Object.assign or spread would turn it into a prototype change.)
 */
export const safeJsonParse = <T = unknown>(text: string): T =>
    JSON.parse(text, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value)) as T;
