import { GlyphData } from '../types';

/**
 * Checks if a glyph has been drawn, considering both freehand points and vector outlines.
 * @param glyphData The glyph data to check.
 * @returns True if the glyph has any drawable content, false otherwise.
 */
export const isGlyphDrawn = (glyphData: GlyphData | undefined): boolean => {
  if (!glyphData || !glyphData.paths || glyphData.paths.length === 0) {
    return false;
  }
  // A glyph is considered drawn if any of its paths have either freehand points or vector segment groups.
  return glyphData.paths.some(
    p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0
  );
};

/**
 * Generates an AGL-compliant glyph name from a Unicode codepoint for font export.
 * @param unicode The decimal Unicode codepoint.
 * @returns The glyph name string (e.g., 'space', 'uni0041', 'u1F600').
 */
export const getGlyphExportNameByUnicode = (unicode: number): string => {
    if (unicode === 32) return 'space';
    const hex = unicode.toString(16).toUpperCase();
    if (unicode < 0x10000) {
        // BMP characters are named uniXXXX
        return `uni${hex.padStart(4, '0')}`;
    } else {
        // SMP characters are named uXXXXX...
        return `u${hex}`;
    }
};
