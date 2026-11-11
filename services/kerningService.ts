
import { Character, CharacterSet, GlyphData, FontMetrics, RecommendedKerning } from '../types';
import { expandMembers } from './groupExpansionService';
import { getAccurateGlyphBBox } from './glyphRenderService';
import { getInkProfile, solveKernFromProfiles, InkProfile } from '../utils/inkProfile';

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
 * 1.  **Ink band by band:** each glyph is cut into thin horizontal bands, noting where its ink
 *     starts and ends in each (see utils/inkProfile.ts).
 *
 * 2.  **Target distance:** the gap the pair must keep.
 *     - **Rule-based:** a `recommendedKerning` rule for the pair sets it:
 *       `['T', 'o', 20]` keeps 20 units; `['A', 'V', 'lsb']` keeps the right glyph's LSB;
 *       `['V', 'A', 0]` kerns until the glyphs touch.
 *     - **Default:** the left glyph's RSB plus the right glyph's LSB, i.e. the normal space
 *       between two letters.
 *
 * 3.  **The kerning:** the right glyph moves as close as it can while every band where both
 *     glyphs have ink keeps at least the target distance. Bands where only one has ink don't
 *     count, so the arm of a T still reaches over an o, while a V never touches an E (K18).
 *     It never goes past half an em, and the right glyph never starts before the left one.
 *
 * 4.  **Performance:** it reports progress and yields to the main thread every few pairs.
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
    const profiles = new Map<GlyphData, InkProfile>();
    const profileOf = (g: GlyphData) => { let pr = profiles.get(g); if (!pr) { pr = getInkProfile(g, strokeThickness); profiles.set(g, pr); } return pr; };
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

        // Each glyph's full ink box (what its advance is built from) and its ink band by band.
        const leftBox = getAccurateGlyphBBox(leftGlyph.paths, strokeThickness);
        const rightBox = getAccurateGlyphBBox(rightGlyph.paths, strokeThickness);
        if (!leftBox || !rightBox) continue;

        // --- Step 1: Determine the target distance. ---
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

        // --- Step 2: The tightest kerning that keeps every band where both glyphs have ink at
        // least targetDistance apart (K18). Comparing whole zones instead let a V's narrow
        // bottom hide its wide top, so V E was kerned until the two touched.
        const bestK = solveKernFromProfiles(
            profileOf(leftGlyph), profileOf(rightGlyph),
            { minX: leftBox.x, maxX: leftBox.x + leftBox.width }, { minX: rightBox.x, maxX: rightBox.x + rightBox.width },
            leftChar.rsb ?? metrics.defaultRSB, rightChar.lsb ?? metrics.defaultLSB, targetDistance, metrics.unitsPerEm
        );

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
