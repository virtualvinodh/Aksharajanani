
import { Character, CharacterSet, GlyphData, FontMetrics, RecommendedKerning } from '../types';
import { expandMembers } from './groupExpansionService';
import { getGlyphSubBBoxes, BBox } from './glyphRenderService';

/**
 * A simple geometric check to see if two rectangular bounding boxes overlap.
 * @param boxA The first bounding box.
 * @param boxB The second bounding box.
 * @returns True if the boxes intersect, false otherwise.
 */
export const doBBoxesCollide = (boxA: BBox | null, boxB: BBox | null): boolean => {
    if (!boxA || !boxB) return false;
    // Boxes do NOT collide if one is entirely to the left, right, top, or bottom of the other.
    // If none of these conditions are true, they must be colliding.
    return !(
        boxA.maxX < boxB.minX ||
        boxA.minX > boxB.maxX ||
        boxA.maxY < boxB.minY ||
        boxA.minY > boxB.maxY
    );
};


/** Whether two boxes overlap vertically (share any height). */
export const sharesRows = (a: BBox, b: BBox): boolean => a.minY <= b.maxY && b.minY <= a.maxY;

export interface KerningGroupContext {
    groups: Record<string, string[]>;
    characterSets: CharacterSet[] | null | undefined;
}

/**
 * The target gap a `recommendedKerning` rule asks for, shared by the auto-kern tool and the
 * background auto-kern (K5). Per positioning_json.md:
 * - an exact pair rule beats a group rule (`$caps`), and groups are expanded;
 * - a missing, null or empty target means "use the default" (returns null), not 0;
 * - `0` (or "0") means kern until the glyphs touch; any other number is the gap;
 * - `'lsb'` / `'rsb'` mean the right glyph's LSB / the left glyph's RSB.
 * Returns `{ rule: false }` when no rule covers the pair.
 */
export const resolveRecommendedTarget = (
    left: Character,
    right: Character,
    recommendedKerning: RecommendedKerning[] | null | undefined,
    metrics: Pick<FontMetrics, 'defaultLSB' | 'defaultRSB'>,
    groupContext?: KerningGroupContext
): { rule: boolean; target: number | null } => {
    if (!recommendedKerning || recommendedKerning.length === 0) return { rule: false, target: null };
    let rule = recommendedKerning.find(r => r[0] === left.name && r[1] === right.name);
    if (!rule && groupContext) {
        rule = recommendedKerning.find(r =>
            expandMembers([r[0]], groupContext.groups, groupContext.characterSets ?? undefined).includes(left.name) &&
            expandMembers([r[1]], groupContext.groups, groupContext.characterSets ?? undefined).includes(right.name)
        );
    }
    if (!rule) return { rule: false, target: null };

    const goal = rule[2];
    if (goal === undefined || goal === null || (typeof goal === 'string' && goal.trim() === '')) return { rule: true, target: null };
    if (goal === 'lsb') return { rule: true, target: right.lsb ?? metrics.defaultLSB };
    if (goal === 'rsb') return { rule: true, target: left.rsb ?? metrics.defaultRSB };
    const n = Number(goal);
    return { rule: true, target: Number.isFinite(n) ? n : null };
};

/**
 * Calculates optically-pleasing kerning values for a list of character pairs.
 * 
 * --- HOW IT WORKS ---
 * This is not a simple bounding box collision algorithm. It's designed to be smarter by
 * understanding the vertical structure of glyphs to achieve better visual spacing.
 * 
 * 1.  **Vertical Zoning:** Each glyph is divided into three vertical zones:
 *     - Ascender Zone: The area above the x-height (e.g., the top of 'h', 'd').
 *     - X-Height Zone: The main body of lowercase letters (e.g., 'a', 'x', 'n'). This is the most
 *       visually important area for kerning.
 *     - Descender Zone: The area below the baseline (e.g., the tail of 'g', 'p').
 * 
 * 2.  **Target Distance:** The algorithm first determines the ideal minimum gap between the glyphs
 *     in the crucial x-height zone. This target is determined in two ways:
 *     - **Rule-Based:** If a `recommendedKerning` rule exists for the pair, its value is used as the target:
 *       - `['T', 'o', 20]`: The target gap is 20 font units.
 *       - `['A', 'V', 'lsb']`: The target gap is the right glyph's Left Side Bearing.
 *       - **`['V', 'A', 0]`**: A value of `0` is a special case. It instructs the algorithm to kern the
 *         pair until their x-height bounding boxes are just touching (a gap of 0).
 *     - **Default:** If no rule exists, it defaults to the sum of the left glyph's Right Side Bearing (RSB)
 *       and the right glyph's Left Side Bearing (LSB). This provides a sensible baseline spacing.
 * 
 * 3.  **Collision Avoidance & Gap Enforcement:**
 *     - The algorithm uses a binary search to efficiently find the tightest possible kerning value.
 *     - For each tested kerning value, it checks for "hard collisions" in the ascender and descender zones.
 *       This prevents tall or low parts of letters from crashing into each other.
 *     - Crucially, it then checks the gap in the x-height zone. If this gap is smaller than the
 *       `targetDistance`, the kerning is considered too tight, even if there's no hard collision. This allows
 *       for pleasing overlaps, like the arm of a 'T' over an 'o', while maintaining proper spacing in the main body.
 * 
 * 4.  **Performance:** The process can be intensive. To prevent UI freezing, it reports progress
 *     and yields to the main thread periodically using `setTimeout`.
 *
 * @param pairsToKern An array of character pairs to process.
 * @param glyphDataMap A map containing the drawing data for all glyphs.
 * @param metrics The font's overall metrics.
 * @param strokeThickness The thickness of strokes, used for accurate bounding box calculation.
 * @param onProgress A callback function to report the progress percentage (0-100).
 * @param recommendedKerning An array of kerning rules that can specify target distances.
 * @returns A Map where keys are 'unicodeLeft-unicodeRight' and values are the calculated kerning amounts.
 */
export async function calculateAutoKerning(
    pairsToKern: { left: Character, right: Character }[],
    glyphDataMap: Map<number, GlyphData>,
    metrics: FontMetrics,
    strokeThickness: number,
    onProgress: (progress: number) => void,
    recommendedKerning: RecommendedKerning[] | null,
    groupContext?: KerningGroupContext
): Promise<Map<string, number>> {

    const newKerningMap = new Map<string, number>();
    const totalPairs = pairsToKern.length;
    if (totalPairs === 0) {
        onProgress(100);
        return newKerningMap;
    }

    // Process each pair provided in the input array.
    for (const [index, pair] of pairsToKern.entries()) {
        const { left: leftChar, right: rightChar } = pair;
        const leftGlyph = glyphDataMap.get(leftChar.unicode);
        const rightGlyph = glyphDataMap.get(rightChar.unicode);

        if (!leftGlyph || !rightGlyph) continue;

        // Get the bounding boxes for the vertical zones (ascender, x-height, descender) of each glyph.
        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);

        // We need the full bounding boxes to proceed.
        if (!leftBoxes || !rightBoxes || !leftBoxes.full || !rightBoxes.full) continue;

        // --- Step 1: Determine the target distance for the x-height gap. ---
        let targetDistance: number;
        const recommended = resolveRecommendedTarget(leftChar, rightChar, recommendedKerning, metrics, groupContext);

        if (recommended.target !== null) {
            // 0 = kern until the glyphs touch; any other value is the gap to keep.
            targetDistance = recommended.target;
        } else {
            // Default logic: The target gap is the sum of the outer side bearings.
            // Correct for negative side bearings to ensure a non-negative target distance.
            const rsbL = (leftChar.rsb ?? metrics.defaultRSB) < 0 ? metrics.defaultRSB : (leftChar.rsb ?? metrics.defaultRSB);
            const lsbR = (rightChar.lsb ?? metrics.defaultLSB) < 0 ? metrics.defaultLSB : (rightChar.lsb ?? metrics.defaultLSB);
            targetDistance = rsbL + lsbR;
        }

        // --- Step 2: Use binary search to find the optimal kerning value efficiently. ---
        // 'low' is the maximum possible negative kerning, 'high' is no kerning.
        let low = -Math.round(metrics.unitsPerEm / 2);
        let high = 0;
        let bestK = 0; // The best valid kerning value found so far.

        // Glyphs that share no height at all (an accent above, a comma below) have nothing to measure
        // a gap against; tucking one under the other is never what a kerning pair is for.
        if (!sharesRows(leftBoxes.full, rightBoxes.full)) low = 1; // skip the search; bestK stays 0

        while (low <= high) {
            const kMid = Math.floor((low + high) / 2);
            
            // Calculate the starting X position of the right glyph's content area based on the current kerning value (kMid).
            const rightStartX = leftBoxes.full.maxX + (leftChar.rsb ?? metrics.defaultRSB) + (rightChar.lsb ?? metrics.defaultLSB) + kMid;
            // Calculate how much the right glyph needs to be shifted from its original position.
            const deltaX = rightStartX - rightBoxes.full.minX;
            
            // Create temporary, translated bounding boxes for the right glyph's zones.
            const rBoxAscenderT = rightBoxes.ascender ? { ...rightBoxes.ascender, minX: rightBoxes.ascender.minX + deltaX, maxX: rightBoxes.ascender.maxX + deltaX } : null;
            const rBoxXHeightT = rightBoxes.xHeight ? { ...rightBoxes.xHeight, minX: rightBoxes.xHeight.minX + deltaX, maxX: rightBoxes.xHeight.maxX + deltaX } : null;
            const rBoxDescenderT = rightBoxes.descender ? { ...rightBoxes.descender, minX: rightBoxes.descender.minX + deltaX, maxX: rightBoxes.descender.maxX + deltaX } : null;

            let isInvalid = false;
            // --- Step 3: Check for hard collisions and gap violations. ---
            // The right glyph may tuck under the left one but never start before it. Without this the
            // search isn't valid: a narrow glyph pushed far enough jumps clean past a narrow neighbour,
            // stops colliding, and the search runs on to the limit (e.g. ! " kerned by half an em).
            if (rightBoxes.full.minX + deltaX < leftBoxes.full.minX) {
                isInvalid = true;
            // Then check for definite collisions in the less critical ascender and descender areas.
            } else if (doBBoxesCollide(leftBoxes.ascender, rBoxAscenderT) || doBBoxesCollide(leftBoxes.descender, rBoxDescenderT)) {
                isInvalid = true;
            } else if (rBoxXHeightT && leftBoxes.xHeight) {
                // If no hard collisions, check the visually important x-height gap.
                const currentGap = rBoxXHeightT.minX - leftBoxes.xHeight.maxX;
                // The kerning is too tight if the actual gap is less than our desired target.
                if (currentGap < targetDistance) {
                    isInvalid = true; 
                }
            } else {
                // FIX: Fallback logic for glyphs without x-height content was flawed.
                // The old logic incorrectly compared the full bounding box gap (which includes side bearings)
                // against the target distance, effectively preventing any negative kerning.
                // The corrected logic simply checks for a hard collision between the full bounding boxes,
                // which is a more robust fallback.
                const rBoxFullT = { ...rightBoxes.full, minX: rightBoxes.full.minX + deltaX, maxX: rightBoxes.full.maxX + deltaX };
                if (doBBoxesCollide(leftBoxes.full, rBoxFullT)) {
                    isInvalid = true;
                }
            }

            if (isInvalid) {
                // This kerning value is too small (too negative). We need to search in the upper half.
                low = kMid + 1;
            } else {
                // This kerning value is valid. Store it as the best so far and try to find an even tighter (more negative) value.
                bestK = kMid;
                high = kMid - 1;
            }
        }
        
        // Store the value if it's negative or zero. A zero value indicates the default spacing is optimal,
        // but we store it to mark the pair as officially 'kerned'.
        if (bestK <= 0) {
            newKerningMap.set(`${leftChar.unicode}-${rightChar.unicode}`, bestK);
        }
        
        // --- Step 4: Report progress. ---
        const progressPercentage = Math.round(((index + 1) / totalPairs) * 100);
        onProgress(progressPercentage);
        
        // Yield to the main thread every 5 pairs to prevent the UI from freezing on large jobs.
        if ((index + 1) % 5 === 0) {
             await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return newKerningMap;
}
