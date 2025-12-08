
import { useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useLocale } from '../contexts/LocaleContext';
import { Path, Point, Segment } from '../types';
import { getAccurateGlyphBBox } from '../services/glyphRenderService';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { VEC } from '../utils/vectorUtils';
import { deepClone } from '../utils/cloneUtils';

// Helper Logic for Transformation
const transformGlyphPaths = (
    paths: Path[], 
    strokeThickness: number, 
    scaleX: number, 
    scaleY: number, 
    rotation: number, 
    flipH: boolean, 
    flipV: boolean
): Path[] => {
    const bbox = getAccurateGlyphBBox(paths, strokeThickness);
    if (!bbox) return paths;

    const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    const angleRad = (rotation * Math.PI) / 180;
    
    const sx = (flipH ? -1 : 1) * scaleX;
    const sy = (flipV ? -1 : 1) * scaleY;

    const transformPoint = (pt: Point) => {
        let px = pt.x - center.x;
        let py = pt.y - center.y;
        px = px * sx;
        py = py * sy;
        const rx = px * Math.cos(angleRad) - py * Math.sin(angleRad);
        const ry = px * Math.sin(angleRad) + py * Math.cos(angleRad);
        return { x: rx + center.x, y: ry + center.y };
    };

    return paths.map(p => {
            const newP = { ...p, points: p.points.map(transformPoint) };
            if (p.segmentGroups) {
                newP.segmentGroups = p.segmentGroups.map(g => g.map(s => {
                    const hInRot = VEC.rotate(s.handleIn, angleRad);
                    const hOutRot = VEC.rotate(s.handleOut, angleRad);
                    const hInTransformed = { x: hInRot.x * sx, y: hInRot.y * sy };
                    const hOutTransformed = { x: hOutRot.x * sx, y: hOutRot.y * sy };
                    return {
                        ...s,
                        point: transformPoint(s.point),
                        handleIn: hInTransformed,
                        handleOut: hOutTransformed
                    };
                }));
            }
            return newP;
    });
};

export const useBatchOperations = () => {
    const { characterSets, dispatch: characterDispatch } = useProject();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { settings, metrics } = useSettings();
    const { t } = useLocale();
    const { showNotification } = useLayout();

    const handleBulkTransform = useCallback((
        selectedUnicodes: Set<number>,
        scaleX: number, scaleY: number, 
        rotation: number, 
        flipH: boolean, flipV: boolean,
        onComplete: () => void
    ) => {
        const previousGlyphData = new Map(glyphDataMap);
        const undo = () => glyphDataDispatch({ type: 'SET_MAP', payload: previousGlyphData });

        const newMap = new Map(glyphDataMap);
        const strokeThickness = settings?.strokeThickness || 15;
        let transformCount = 0;

        selectedUnicodes.forEach(unicode => {
            const glyph = newMap.get(unicode);
            if (!glyph || !isGlyphDrawn(glyph)) return;
            const newPaths = transformGlyphPaths(glyph.paths, strokeThickness, scaleX, scaleY, rotation, flipH, flipV);
            newMap.set(unicode, { paths: newPaths });
            transformCount++;
        });

        if (transformCount > 0) {
            glyphDataDispatch({ type: 'SET_MAP', payload: newMap });
            showNotification(t('updateComplete'), 'success', { onUndo: undo });
        }
        onComplete();
    }, [glyphDataMap, settings?.strokeThickness, glyphDataDispatch, showNotification, t]);

    const handleSaveMetrics = useCallback((
        selectedUnicodes: Set<number>,
        newLSB: string, newRSB: string,
        onComplete: () => void
    ) => {
        const previousCharSets = deepClone(characterSets);
        const undo = () => characterDispatch({ type: 'SET_CHARACTER_SETS', payload: previousCharSets });

        const lsbVal = newLSB.trim() === '' ? undefined : parseInt(newLSB, 10);
        const rsbVal = newRSB.trim() === '' ? undefined : parseInt(newRSB, 10);
        
        // Helper to find char across all sets
        const findChar = (u: number) => {
            if (!characterSets) return null;
            for (const set of characterSets) {
                const found = set.characters.find(c => c.unicode === u);
                if (found) return found;
            }
            return null;
        };

        selectedUnicodes.forEach(unicode => {
             const char = findChar(unicode);
             if (char) {
                 const updatePayload: any = { unicode };
                 let hasUpdate = false;
                 if (lsbVal !== undefined) { updatePayload.lsb = lsbVal; hasUpdate = true; }
                 else { updatePayload.lsb = char.lsb; }

                 if (rsbVal !== undefined) { updatePayload.rsb = rsbVal; hasUpdate = true; }
                 else { updatePayload.rsb = char.rsb; }
                 
                 if (hasUpdate) {
                     characterDispatch({ type: 'UPDATE_CHARACTER_BEARINGS', payload: updatePayload });
                 }
             }
        });
        
        showNotification(t('updateComplete'), 'success', { onUndo: undo });
        onComplete();
    }, [characterSets, characterDispatch, showNotification, t]);

    const handleBulkDelete = useCallback((
        selectedUnicodes: Set<number>,
        onComplete: () => void
    ) => {
        if (selectedUnicodes.size === 0) return;

        const glyphDataSnapshot = new Map(glyphDataMap);
        const characterSetsSnapshot = deepClone(characterSets);
        const kerningSnapshot = new Map(kerningMap);
        const positioningSnapshot = new Map(markPositioningMap);

        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
            kerningDispatch({ type: 'SET_MAP', payload: kerningSnapshot });
            positioningDispatch({ type: 'SET_MAP', payload: positioningSnapshot });
        };

        const newKerningMap = new Map(kerningMap);
        newKerningMap.forEach((value, key) => {
            const [left, right] = key.split('-').map(Number);
            if (selectedUnicodes.has(left) || selectedUnicodes.has(right)) {
                newKerningMap.delete(key);
            }
        });

        const newPositioningMap = new Map(markPositioningMap);
        newPositioningMap.forEach((value, key) => {
            const [base, mark] = key.split('-').map(Number);
            if (selectedUnicodes.has(base) || selectedUnicodes.has(mark)) {
                newPositioningMap.delete(key);
            }
        });
        
        selectedUnicodes.forEach(unicode => {
             glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
             characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        });
        
        kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
        positioningDispatch({ type: 'SET_MAP', payload: newPositioningMap });

        showNotification(t('glyphDeletedSuccess', { name: `${selectedUnicodes.size} glyphs` }), 'success', { onUndo: undo });
        onComplete();
    }, [glyphDataMap, characterSets, kerningMap, markPositioningMap, glyphDataDispatch, characterDispatch, kerningDispatch, positioningDispatch, showNotification, t]);

    return {
        handleBulkTransform,
        handleSaveMetrics,
        handleBulkDelete,
        transformGlyphPaths
    };
};
