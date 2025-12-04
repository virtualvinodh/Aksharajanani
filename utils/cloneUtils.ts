
/**
 * Deep clones a value using structuredClone if available (modern browsers),
 * falling back to JSON.parse(JSON.stringify) for compatibility.
 * 
 * @param value The value to clone
 * @returns A deep copy of the value
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (e) {
      // Fallback if structuredClone fails (e.g. on non-cloneable types)
      // though for POJOs in this app, this shouldn't happen often.
      console.warn('structuredClone failed, falling back to JSON cloning', e);
    }
  }
  return JSON.parse(JSON.stringify(value));
}
