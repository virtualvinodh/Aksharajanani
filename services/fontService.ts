

import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, Point, Path, KerningMap, MarkPositioningMap, PositioningRules, MarkAttachmentRules } from '../types';
import { compileFeaturesAndPatch, patchFont } from './pythonFontService';
import { VEC } from '../utils/vectorUtils';
import { getAccurateGlyphBBox, generateCompositeGlyphData } from './glyphRenderService';
import { calculateDefaultMarkOffset } from './positioningHeuristicsService';
import { isGlyphDrawn, shouldExportEmpty } from '../utils/glyphUtils';
import { expandMembers } from './groupExpansionService';
import { deepClone } from '../utils/cloneUtils';

export const exportToOtf = async (
    glyphData: Map<number, GlyphData>,
    settings: AppSettings,
    t: (key: string, replacements?: { [key: string]: string | number }) => string,
    fontRules: any,
    metrics: FontMetrics,
    characterSets: CharacterSet[],
    kerningMap: KerningMap,
    markPositioningMap: MarkPositioningMap,
    allCharsByUnicode: Map<number, Character>,
    positioningRules: PositioningRules[] | null,
    markAttachmentRules: MarkAttachmentRules | null,
    isFeaEditMode: boolean | undefined,
    manualFeaCode: string | null | undefined,
    showNotification: (message: string, type?: 'success' | 'info') => void,
    isEditMode?: boolean,
    baseFontBinary?: Uint8Array
): Promise<{ blob: Blob, feaError: string | null }> => {
    
    const finalGlyphData = new Map(glyphData.entries());
    
    const shouldExportEmptyMap = new Map<number, boolean>();
    // Pre-calculate shouldExportEmpty for all relevant unicodes to pass to the worker.
    // This effectively "sends" the UnicodeProperties library's knowledge to the worker.
    finalGlyphData.forEach((_, unicode) => {
        const char = allCharsByUnicode.get(unicode);
        shouldExportEmptyMap.set(unicode, shouldExportEmpty(unicode, char?.name));
    });
    allCharsByUnicode.forEach((char, unicode) => {
        shouldExportEmptyMap.set(unicode, shouldExportEmpty(unicode, char.name));
    });
    [32, 8205, 8204].forEach(u => {
        const char = allCharsByUnicode.get(u);
        shouldExportEmptyMap.set(u, shouldExportEmpty(u, char?.name));
    });

    const allCharsByName = new Map<string, Character>();
    allCharsByUnicode.forEach(char => allCharsByName.set(char.name, char));
    
    const groups = fontRules?.groups || {};

    // Bake composite/linked glyphs that have no stored drawing of their own.
    // The UI counts these as complete once their components are drawn (isGlyphComplete), but
    // their outlines are only stored after the glyph is opened in the editor or the cascade
    // worker runs. Without this, such glyphs were missing from the font and any feature
    // referencing them failed to compile. Repeat until stable so nested composites resolve.
    const bakeUndrawnComposites = () => {
        let changed = true;
        for (let pass = 0; changed && pass <= allCharsByUnicode.size; pass++) {
            changed = false;
            allCharsByUnicode.forEach(char => {
                if (char.unicode === undefined || char.glyphClass === 'virtual') return;
                if (!(char.link?.length || char.composite?.length)) return;
                if (isGlyphDrawn(finalGlyphData.get(char.unicode))) return;
                const baked = generateCompositeGlyphData({
                    character: char,
                    allCharsByName,
                    allGlyphData: finalGlyphData,
                    settings,
                    metrics,
                    markAttachmentRules,
                    allCharacterSets: characterSets,
                    groups,
                });
                if (baked && isGlyphDrawn(baked)) {
                    finalGlyphData.set(char.unicode, baked);
                    changed = true;
                }
            });
        }
    };
    bakeUndrawnComposites();

    // Bake dynamic/implicit ligatures (GSUB) and kerned pairs before compiling font outlines
    allCharsByUnicode.forEach(char => {
        // Condition: Is a composite glyph that needs to be baked (not a GPOS rule) and has a unicode.
        if (char.position && char.glyphClass !== 'virtual' && char.unicode) {
            // Don't overwrite if it's already manually drawn.
            if (isGlyphDrawn(finalGlyphData.get(char.unicode))) {
                return;
            }
    
            const [baseName, markName] = char.position;
            const baseChar = allCharsByName.get(baseName);
            const markChar = allCharsByName.get(markName);
    
            if (!baseChar || !markChar || baseChar.unicode === undefined || markChar.unicode === undefined) return;
    
            const baseGlyphData = finalGlyphData.get(baseChar.unicode);
            const markGlyphData = finalGlyphData.get(markChar.unicode);
    
            if (!isGlyphDrawn(baseGlyphData) || !isGlyphDrawn(markGlyphData)) return;
    
            // --- Offset Priority Logic ---
            let offset: Point;
            const key = `${baseChar.unicode}-${markChar.unicode}`;
            
            // Priority 1: Check for manual override from the positioning map.
            const manualOffset = markPositioningMap.get(key);
            if (manualOffset) {
                offset = manualOffset;
            } else {
            // Priority 2: Fallback to default calculation.
                const baseBbox = getAccurateGlyphBBox(baseGlyphData!.paths, settings.strokeThickness);
                const markBbox = getAccurateGlyphBBox(markGlyphData!.paths, settings.strokeThickness);
                
                let movementConstraint: 'horizontal' | 'vertical' | 'none' = 'none';
                if (positioningRules) {
                     const rule = positioningRules.find(r => 
                        expandMembers(r.base, groups, characterSets).includes(baseName) && 
                        expandMembers(r.mark || [], groups, characterSets).includes(markName)
                    );
                    if (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) {
                        movementConstraint = rule.movement;
                    }
                }
                
                offset = calculateDefaultMarkOffset(
                    baseChar, 
                    markChar, 
                    baseBbox, 
                    markBbox, 
                    markAttachmentRules, 
                    metrics, 
                    characterSets, 
                    false, 
                    groups,
                    movementConstraint
                );
            }
    
            // --- Bake Geometry ---
            const transformedMarkPaths = deepClone(markGlyphData!.paths).map((p: Path) => {
                p.points = p.points.map(pt => VEC.add(pt, offset));
                if (p.segmentGroups) {
                    p.segmentGroups.forEach(group => {
                        group.forEach(seg => {
                            seg.point = VEC.add(seg.point, offset);
                        });
                    });
                }
                return p;
            });
    
            const combinedPaths = [...deepClone(baseGlyphData!.paths), ...transformedMarkPaths];
            finalGlyphData.set(char.unicode, { paths: combinedPaths });
        } else if (char.kern && char.glyphClass !== 'virtual' && char.unicode) {
            // Don't overwrite if it's already manually drawn.
            if (isGlyphDrawn(finalGlyphData.get(char.unicode))) {
                return;
            }

            const [leftName, rightName] = char.kern;
            const leftChar = allCharsByName.get(leftName);
            const rightChar = allCharsByName.get(rightName);

            if (!leftChar || !rightChar || leftChar.unicode === undefined || rightChar.unicode === undefined) return;

            const leftGlyphData = finalGlyphData.get(leftChar.unicode);
            const rightGlyphData = finalGlyphData.get(rightChar.unicode);

            if (!isGlyphDrawn(leftGlyphData) || !isGlyphDrawn(rightGlyphData)) return;
            
            // --- Calculate Horizontal Shift ---
            const kernValue = kerningMap.get(`${leftChar.unicode}-${rightChar.unicode}`) ?? 0;
            
            const leftBbox = getAccurateGlyphBBox(leftGlyphData!.paths, settings.strokeThickness);
            const rightBbox = getAccurateGlyphBBox(rightGlyphData!.paths, settings.strokeThickness);

            if (!leftBbox || !rightBbox) return;

            const leftRsb = leftChar.rsb ?? metrics.defaultRSB;
            const rightLsb = rightChar.lsb ?? metrics.defaultLSB;
            
            const rightGlyphContentStartX = (leftBbox.x + leftBbox.width) + leftRsb + kernValue + rightLsb;
            const deltaX = rightGlyphContentStartX - rightBbox.x;

            // --- Bake Geometry ---
            const translatedRightPaths = deepClone(rightGlyphData!.paths).map((p: Path) => {
                const offset = { x: deltaX, y: 0 };
                p.points = p.points.map(pt => VEC.add(pt, offset));
                if (p.segmentGroups) {
                    p.segmentGroups.forEach(group => {
                        group.forEach(seg => {
                            seg.point = VEC.add(seg.point, offset);
                        });
                    });
                }
                return p;
            });
    
            const combinedPaths = [...deepClone(leftGlyphData!.paths), ...translatedRightPaths];
            finalGlyphData.set(char.unicode, { paths: combinedPaths });
        }
    });

    // Composites whose components are themselves baked positioned/kerned pairs.
    bakeUndrawnComposites();

    // Stage 1: Generate base font outlines in a non-blocking Web Worker.
    const fontBlob = await new Promise<Blob>((resolve, reject) => {
        // A bundled module worker (see workers/fontWorker.ts). Vite rewrites this URL for both the
        // dev server and production builds, so the worker's code survives minification.
        const worker = new Worker(new URL('../workers/fontWorker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = e => {
            worker.terminate();
            if (e.data.success) {
                resolve(new Blob([e.data.fontBuffer], { type: 'font/opentype' }));
            } else {
                reject(new Error(e.data.error));
            }
        };

        worker.onerror = e => {
            worker.terminate();
            reject(new Error(`Worker error: ${e.message || 'failed to load font worker'}`));
        };

        worker.postMessage({
            glyphDataArray: Array.from(finalGlyphData.entries()),
            shouldExportEmptyMapArray: Array.from(shouldExportEmptyMap.entries()),
            settings,
            fontRules,
            metrics,
            characterSets,
            isEditMode
        });
    });
    
    // Stage 2: Generate the full FEA code
    if (isEditMode && baseFontBinary) {
        // Edit Mode: Skip FEA compilation and patch the base font
        const deltaBlob = fontBlob; // The blob we just generated is the delta
        const baseBlob = new Blob([baseFontBinary], { type: 'font/opentype' });
        
        const patchedBlob = await patchFont(baseBlob, deltaBlob, showNotification, t);
        return { blob: patchedBlob, feaError: null };
    }

    // The FEA generator (with its Unicode data table) is only needed when a font is built,
    // so it's loaded on first export instead of with the editor.
    const { generateFea } = await import('./feaService');
    const feaContent = isFeaEditMode 
        ? manualFeaCode || '' 
        : generateFea(
            fontRules, 
            kerningMap, 
            markPositioningMap, 
            allCharsByUnicode, 
            settings.fontName, 
            positioningRules, 
            finalGlyphData, 
            metrics, 
            characterSets, 
            markAttachmentRules,
            settings.strokeThickness
        );

    // Stage 3: Use Pyodide to compile the FEA and patch the font
    const { blob: patchedBlob, feaError } = await compileFeaturesAndPatch(fontBlob, feaContent, showNotification, t);
    
    return { blob: patchedBlob, feaError };
};