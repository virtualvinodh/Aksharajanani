
import { GlyphData, Character, MarkPositioningMap, KerningMap } from '../types';

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
    allCharsByName: Map<string, Character>
): boolean => {
    // 1. If it has direct drawing data, it is renderable.
    if (char.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(char.unicode))) {
        return true;
    }

    // 2. Helper to check a list of component names
    const areComponentsReady = (names: string[]): boolean => {
        return names.every(name => {
            const comp = allCharsByName.get(name);
            // We verify the component exists, has a unicode, and that unicode slot has drawing data.
            // Note: This does not currently support deep recursion (linked glyphs linking to linked glyphs),
            // but fits the current flat architecture where components are usually base glyphs.
            return comp && comp.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(comp.unicode));
        });
    };

    // 3. Check specific construction types
    if (char.position) return areComponentsReady(char.position);
    if (char.kern) return areComponentsReady(char.kern);
    if (char.link) return areComponentsReady(char.link);
    if (char.composite) return areComponentsReady(char.composite);

    // 4. Special Case: ZWJ/ZWNJ/Space are always "renderable" (though invisible)
    if (char.unicode === 32 || char.unicode === 8204 || char.unicode === 8205) return true;

    return false;
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
    allCharsByName: Map<string, Character>
): boolean => {
    if (!character) return false;

    // 1. Manually drawn in the editor
    if (isGlyphDrawn(glyphDataMap.get(character.unicode))) {
        return true;
    }

    // 2. An accepted (saved) positioned pair
    if (character.position) {
        const base = allCharsByName.get(character.position[0]);
        const mark = allCharsByName.get(character.position[1]);
        if (base?.unicode !== undefined && mark?.unicode !== undefined) {
            if (markPositioningMap.has(`${base.unicode}-${mark.unicode}`)) {
                return true;
            }
        }
    }

    // 3. An accepted (saved) kerned pair
    if (character.kern) {
        const left = allCharsByName.get(character.kern[0]);
        const right = allCharsByName.get(character.kern[1]);
        if (left?.unicode !== undefined && right?.unicode !== undefined) {
            if (kerningMap.has(`${left.unicode}-${right.unicode}`)) {
                return true;
            }
        }
    }

    // 4. A linked or composite glyph whose source components are drawn
    const components = character.link || character.composite;
    if (components) {
         return components.every(name => {
            const comp = allCharsByName.get(name);
            // Use isGlyphDrawn for source components, not isGlyphComplete, to avoid infinite recursion.
            return comp && isGlyphDrawn(glyphDataMap.get(comp.unicode));
        });
    }

    return false;
};
