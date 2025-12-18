
// A simple, non-cryptographic 53-bit hash function (cyrb53).
export const simpleHash = (str: string, seed = 0): string => {
    let h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  };

/**
 * Ensures class names follow the Adobe FEA spec: Alphanumeric, underscores, periods, hyphens. No spaces.
 * Spaces are converted to underscores, illegal characters are stripped.
 */
export const sanitizeIdentifier = (name: string): string => 
  name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
