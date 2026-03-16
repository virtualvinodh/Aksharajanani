
import { GlyphData, Character, MarkPositioningMap, KerningMap } from '../types';

declare const UnicodeProperties: any;

/**
 * Determines if a character should be exported even if it has no drawn paths.
 * This includes whitespace, control characters (Cc), format characters (Cf), and glyphs with 'null' in their name.
 */
export const shouldExportEmpty = (unicode: number | undefined, name?: string): boolean => {
    if (name?.toLowerCase().includes('null')) return true;
    if (unicode === undefined) return false;
    if (typeof UnicodeProperties === 'undefined') {
        // Fallback to hardcoded list if library is not available
        return unicode === 32 || unicode === 8205 || unicode === 8204;
    }
    const category = UnicodeProperties.getCategory(unicode);
    const isSeparator = category && category.startsWith('Z');
    return isSeparator || category === 'Cf' || category === 'Cc';
};

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
 * Checks if a glyph can be rendered visually.
 * - If it's a base glyph, checks if it is drawn.
 * - If it's a constructed glyph (link/position/kern), checks if ALL its components are drawn.
 */
export const isGlyphRenderable = (
    char: Character,
    glyphDataMap: Map<number, GlyphData>,
    allCharsByName: Map<string, Character>,
    visited = new Set<string>(),
    memo = new Map<string, boolean>()
): boolean => {
    if (memo.has(char.name)) return memo.get(char.name)!;

    // Prevent infinite recursion
    if (visited.has(char.name)) return false;
    const nextVisited = new Set(visited);
    nextVisited.add(char.name);

    let result = false;

    // 1. If it has direct drawing data, it is renderable.
    if (char.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(char.unicode))) {
        result = true;
    } else {
        // 2. Helper to check a list of component names
        const areComponentsReady = (names: string[]): boolean => {
            return names.every(name => {
                const comp = allCharsByName.get(name);
                return comp && isGlyphRenderable(comp, glyphDataMap, allCharsByName, nextVisited, memo);
            });
        };

        // 3. Check specific construction types
        if (char.position) result = areComponentsReady(char.position);
        else if (char.kern) result = areComponentsReady(char.kern);
        else if (char.link) result = areComponentsReady(char.link);
        else if (char.composite) result = areComponentsReady(char.composite);
        // 4. Special Case: Whitespace, Control, and Format characters are always "renderable" (though invisible)
        else if (shouldExportEmpty(char.unicode, char.name)) result = true;
    }

    memo.set(char.name, result);
    return result;
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

/**
 * Checks if a glyph is "complete" based on a broader definition that includes
 * being manually drawn, being an "accepted" positioned/kerned pair, or
 * being a linked/composite glyph whose source components are drawn.
 * @param character The character to check.
 * @param glyphDataMap The map of all glyph drawing data.
 * @param markPositioningMap The map of manually positioned pairs.
 * @param kerningMap The map of manually kerned pairs.
 * @param allCharsByName A map of all characters by name for component lookups.
 * @returns True if the glyph is considered complete.
 */
export const isGlyphComplete = (
    character: Character | undefined,
    glyphDataMap: Map<number, GlyphData>,
    markPositioningMap: MarkPositioningMap,
    kerningMap: KerningMap,
    allCharsByName: Map<string, Character>,
    visited = new Set<string>(),
    memo = new Map<string, boolean>()
): boolean => {
    if (!character) return false;

    if (memo.has(character.name)) return memo.get(character.name)!;

    // Prevent infinite recursion
    if (visited.has(character.name)) return false;
    const nextVisited = new Set(visited);
    nextVisited.add(character.name);

    let result = false;

    // 1. Manually drawn in the editor
    if (character.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(character.unicode))) {
        result = true;
    }
    
    // 2. An accepted (saved) positioned pair
    if (!result && character.position) {
        const base = allCharsByName.get(character.position[0]);
        const mark = allCharsByName.get(character.position[1]);
        if (base?.unicode !== undefined && mark?.unicode !== undefined) {
            if (markPositioningMap.has(`${base.unicode}-${mark.unicode}`)) {
                result = true;
            }
        }
    }
    
    // 3. An accepted (saved) kerned pair
    if (!result && character.kern) {
        const left = allCharsByName.get(character.kern[0]);
        const right = allCharsByName.get(character.kern[1]);
        if (left?.unicode !== undefined && right?.unicode !== undefined) {
            if (kerningMap.has(`${left.unicode}-${right.unicode}`)) {
                result = true;
            }
        }
    }
    
    // 4. A linked or composite glyph whose source components are drawn
    if (!result) {
        const components = character.link || character.composite;
        if (components) {
             result = components.every(name => {
                const comp = allCharsByName.get(name);
                return comp && isGlyphComplete(comp, glyphDataMap, markPositioningMap, kerningMap, allCharsByName, nextVisited, memo);
            });
        }
    }

    memo.set(character.name, result);
    return result;
};
