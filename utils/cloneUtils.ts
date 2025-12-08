
/**
 * Deep clones a value.
 * 
 * We prioritize structuredClone because it supports:
 * 1. Map and Set objects (Critical for GlyphDataMap and selection sets)
 * 2. Circular references
 * 3. Better performance than JSON serialization
 * 
 * @param value The value to clone
 * @returns A deep copy of the value
 */
export function deepClone<T>(value: T): T {
  // 1. Primary Method: structuredClone (Modern, fast, supports Maps/Sets)
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (e) {
      console.warn('structuredClone failed (likely contains non-clonable data), attempting fallback.', e);
    }
  }

  // 2. Specific handling for Map/Set if structuredClone failed or isn't available
  // (JSON.stringify converts Maps/Sets to empty objects {}, which destroys data)
  if (value instanceof Map) {
    return new Map(value) as unknown as T;
  }
  if (value instanceof Set) {
    return new Set(value) as unknown as T;
  }
  if (Array.isArray(value)) {
     return value.map(item => deepClone(item)) as unknown as T;
  }
  
  if (value && typeof value === 'object') {
      const copy: any = {};
      for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
              copy[key] = deepClone((value as any)[key]);
          }
      }
      return copy as T;
  }

  // 3. Fallback: JSON Serialization
  // Useful for simple objects, strips undefined, breaks circular refs
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    console.error('All cloning methods failed. Returning original value (unsafe).', e);
    return value;
  }
}
