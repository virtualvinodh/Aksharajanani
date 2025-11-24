
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLocale } from '../contexts/LocaleContext';
import { Character, GlyphData, Path, Point, Segment } from '../types';
import { isGlyphDrawn } from '../utils/glyphUtils';
import GlyphTile from './GlyphTile';
import Modal from './Modal';
import { EditIcon, CheckCircleIcon, TrashIcon, SettingsIcon, LeftArrowIcon, RightArrowIcon } from '../constants';
import { useLayout } from '../contexts/LayoutContext';
import { VEC } from '../utils/vectorUtils';
import { getAccurateGlyphBBox } from '../services/glyphRenderService';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';

// --- Helper Logic for Transformation (Shared between Preview and Apply) ---
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
        // 1. Translate to center (relative to bbox center)
        let px = pt.x - center.x;
        let py = pt.y - center.y;

        // 2. Scale & Flip
        px = px * sx;
        py = py * sy;
        
        // 3. Rotate
        const rx = px * Math.cos(angleRad) - py * Math.sin(angleRad);
        const ry = px * Math.sin(angleRad) + py * Math.cos(angleRad);

        // 4. Translate back
        return { x: rx + center.x, y: ry + center.y };
    };

    return paths.map(p => {
            // Handle normal points
            const newP = { ...p, points: p.points.map(transformPoint) };
            
            // Handle Outline Segment Groups (Handles must be rotated/scaled relative to anchor)
            if (p.segmentGroups) {
                newP.segmentGroups = p.segmentGroups.map(g => g.map(s => {
                    // Rotate handles locally
                    const hInRot = VEC.rotate(s.handleIn, angleRad);
                    const hOutRot = VEC.rotate(s.handleOut, angleRad);
                    // Scale handles
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


const BulkEditWorkspace: React.FC = () => {
    const { characterSets, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { settings, metrics } = useSettings();
    const { t } = useLocale();
    const { showNotification, metricsSelection, setMetricsSelection } = useLayout();

    const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
    const [isTransformModalOpen, setIsTransformModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    // Filter to only drawn characters
    const drawnCharacters = useMemo(() => {
        if (!characterSets) return [];
        return characterSets
            .flatMap(set => set.characters)
            .filter(char => char.unicode !== undefined && !char.hidden && isGlyphDrawn(glyphDataMap.get(char.unicode)))
            .sort((a, b) => a.unicode! - b.unicode!);
    }, [characterSets, glyphDataMap]);

    const selectedGlyphData = useMemo(() => {
        return drawnCharacters.filter(c => metricsSelection.has(c.unicode!));
    }, [drawnCharacters, metricsSelection]);

    const toggleSelection = (unicode: number) => {
        setMetricsSelection(prev => {
            const newSet = new Set(prev);
            if (newSet.has(unicode)) newSet.delete(unicode);
            else newSet.add(unicode);
            return newSet;
        });
    };

    const handleSelectAll = () => {
        setMetricsSelection(new Set(drawnCharacters.map(c => c.unicode!)));
    };

    const handleSelectNone = () => {
        setMetricsSelection(new Set());
    };

    // --- Metrics (Properties) Handlers ---
    const handleSaveMetrics = (newLSB: string, newRSB: string, newAdvWidth: string) => {
        // Snapshot state for Undo
        const previousCharSets = JSON.parse(JSON.stringify(characterSets));
        const undo = () => {
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: previousCharSets });
        };

        const lsbVal = newLSB.trim() === '' ? undefined : parseInt(newLSB, 10);
        const rsbVal = newRSB.trim() === '' ? undefined : parseInt(newRSB, 10);
        
        metricsSelection.forEach(unicode => {
             const char = drawnCharacters.find(c => c.unicode === unicode);
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
        setIsPropertiesModalOpen(false);
        setMetricsSelection(new Set());
    };

    // --- Delete Handlers ---
    const handleBulkDelete = () => {
        if (metricsSelection.size === 0) return;

        // 1. Snapshot for Undo (All contexts)
        const glyphDataSnapshot = new Map(glyphDataMap);
        const characterSetsSnapshot = JSON.parse(JSON.stringify(characterSets));
        const kerningSnapshot = new Map(kerningMap);
        const positioningSnapshot = new Map(markPositioningMap);

        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
            kerningDispatch({ type: 'SET_MAP', payload: kerningSnapshot });
            positioningDispatch({ type: 'SET_MAP', payload: positioningSnapshot });
        };

        // 2. Calculate Cascading Deletes
        const newKerningMap = new Map(kerningMap);
        const newPositioningMap = new Map(markPositioningMap);

        // Filter Kerning: Remove any pair involving ANY selected unicode
        newKerningMap.forEach((value, key) => {
            const [left, right] = key.split('-').map(Number);
            if (metricsSelection.has(left) || metricsSelection.has(right)) {
                newKerningMap.delete(key);
            }
        });

        // Filter Positioning: Remove any pair involving ANY selected unicode
        newPositioningMap.forEach((value, key) => {
            const [base, mark] = key.split('-').map(Number);
            if (metricsSelection.has(base) || metricsSelection.has(mark)) {
                newPositioningMap.delete(key);
            }
        });
        
        // 3. Dispatch Updates
        metricsSelection.forEach(unicode => {
             glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
             characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        });
        
        kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
        positioningDispatch({ type: 'SET_MAP', payload: newPositioningMap });

        showNotification(t('glyphDeletedSuccess', { name: `${metricsSelection.size} glyphs` }), 'success', { onUndo: undo });
        setIsDeleteConfirmOpen(false);
        setMetricsSelection(new Set());
    };

    // --- Transform Handlers ---
    const handleBulkTransform = (
        scaleX: number, scaleY: number, 
        rotation: number, 
        flipH: boolean, flipV: boolean
    ) => {
        // Snapshot for Undo
        const previousGlyphData = new Map(glyphDataMap);
        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: previousGlyphData });
        };

        const newMap = new Map(glyphDataMap);
        const strokeThickness = settings?.strokeThickness || 15;
        let transformCount = 0;

        metricsSelection.forEach(unicode => {
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

        setIsTransformModalOpen(false);
        setMetricsSelection(new Set());
    };


    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
            <div className="p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0 sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('batchOperations')}</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">
                         {t('metricsSelection', { count: metricsSelection.size })}
                    </span>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
                     <div className="flex gap-1 mr-2">
                        <button onClick={handleSelectAll} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors whitespace-nowrap">{t('selectAll')}</button>
                        <button onClick={handleSelectNone} disabled={metricsSelection.size === 0} className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 whitespace-nowrap">{t('selectNone')}</button>
                     </div>
                     
                     <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-1 self-center hidden sm:block"></div>

                    <button 
                        onClick={() => setIsPropertiesModalOpen(true)}
                        disabled={metricsSelection.size === 0}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap text-sm"
                    >
                        <SettingsIcon /> <span className="hidden sm:inline">{t('editProperties')}</span>
                    </button>
                    <button 
                        onClick={() => setIsTransformModalOpen(true)}
                        disabled={metricsSelection.size === 0}
                        className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap text-sm"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                         <span className="hidden sm:inline">{t('transform')}</span>
                    </button>
                    <button 
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        disabled={metricsSelection.size === 0}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap text-sm"
                    >
                        <TrashIcon /> <span className="hidden sm:inline">{t('delete')}</span>
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {drawnCharacters.map(char => (
                        <div 
                            key={char.unicode}
                            onClick={() => toggleSelection(char.unicode!)}
                            className={`relative bg-white dark:bg-gray-800 border rounded-lg p-4 flex items-center gap-4 transition-all cursor-pointer hover:shadow-md ${metricsSelection.has(char.unicode!) ? 'ring-2 ring-indigo-500 border-transparent bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                        >
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${metricsSelection.has(char.unicode!) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400 bg-white dark:bg-gray-700'}`}>
                                {metricsSelection.has(char.unicode!) && <CheckCircleIcon className="w-4 h-4 text-white" />}
                            </div>
                            <div className="w-16 h-16 flex-shrink-0">
                                <GlyphTile character={char} glyphData={glyphDataMap.get(char.unicode!)} strokeThickness={settings?.strokeThickness || 15} />
                            </div>
                            <div className="flex-grow min-w-0">
                                <div className="text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-1 mt-1">
                                    <span>LSB: <span className="font-mono text-gray-800 dark:text-gray-200">{char.lsb ?? metrics?.defaultLSB}</span></span>
                                    <span>RSB: <span className="font-mono text-gray-800 dark:text-gray-200">{char.rsb ?? metrics?.defaultRSB}</span></span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <BulkPropertiesModal 
                isOpen={isPropertiesModalOpen} 
                onClose={() => setIsPropertiesModalOpen(false)} 
                onSave={handleSaveMetrics}
                count={metricsSelection.size}
            />

            <BulkTransformModal
                isOpen={isTransformModalOpen}
                onClose={() => setIsTransformModalOpen(false)}
                onConfirm={handleBulkTransform}
                count={metricsSelection.size}
                selectedGlyphs={selectedGlyphData}
                glyphDataMap={glyphDataMap}
                strokeThickness={settings?.strokeThickness || 15}
            />

            <Modal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                title={t('confirmDeleteSelectedTitle')}
                titleClassName="text-red-600"
                footer={
                    <>
                        <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button>
                        <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t('delete')}</button>
                    </>
                }
            >
                <p>{t('confirmDeleteSelectedMessage', { count: metricsSelection.size })}</p>
            </Modal>
        </div>
    );
};

const BulkPropertiesModal: React.FC<{ isOpen: boolean, onClose: () => void, onSave: (l: string, r: string, w: string) => void, count: number }> = ({ isOpen, onClose, onSave, count }) => {
    const { t } = useLocale();
    const [lsb, setLsb] = useState('');
    const [rsb, setRsb] = useState('');

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${t('editProperties')} (${count})`} footer={
            <>
                <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button>
                <button onClick={() => onSave(lsb, rsb, '')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{t('save')}</button>
            </>
        }>
            <div className="space-y-4">
                <p className="text-sm text-gray-500">Leave fields blank to keep existing values.</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('leftSpace')} (LSB)</label>
                        <input type="number" value={lsb} onChange={e => setLsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('rightSpace')} (RSB)</label>
                        <input type="number" value={rsb} onChange={e => setRsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

interface BulkTransformModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (sx: number, sy: number, r: number, fh: boolean, fv: boolean) => void;
    count: number;
    selectedGlyphs: Character[];
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
}

const BulkTransformModal: React.FC<BulkTransformModalProps> = ({ isOpen, onClose, onConfirm, count, selectedGlyphs, glyphDataMap, strokeThickness }) => {
    const { t } = useLocale();
    const [scaleX, setScaleX] = useState('1.0');
    const [scaleY, setScaleY] = useState('1.0');
    const [rotation, setRotation] = useState('0');
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [lockAspect, setLockAspect] = useState(true);
    const [previewIndex, setPreviewIndex] = useState(0);

    // Reset state on open
    useEffect(() => {
        if(isOpen) {
            setScaleX('1.0'); setScaleY('1.0'); setRotation('0'); setFlipH(false); setFlipV(false); setPreviewIndex(0);
        }
    }, [isOpen]);

    const handleScaleXChange = (val: string) => {
        setScaleX(val);
        if (lockAspect) setScaleY(val);
    };

    const handleSubmit = () => {
        onConfirm(parseFloat(scaleX) || 1, parseFloat(scaleY) || 1, parseFloat(rotation) || 0, flipH, flipV);
    };

    const previewGlyph = selectedGlyphs[previewIndex];
    const transformedPreviewGlyphData = useMemo(() => {
        if (!previewGlyph) return null;
        const originalData = glyphDataMap.get(previewGlyph.unicode!);
        if (!originalData) return null;
        
        const sx = parseFloat(scaleX) || 1;
        const sy = parseFloat(scaleY) || 1;
        const r = parseFloat(rotation) || 0;
        
        const transformedPaths = transformGlyphPaths(originalData.paths, strokeThickness, sx, sy, r, flipH, flipV);
        return { paths: transformedPaths };
    }, [previewGlyph, glyphDataMap, strokeThickness, scaleX, scaleY, rotation, flipH, flipV]);


    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('transformGlyphsTitle', { count })} footer={
            <>
                <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button>
                <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded-lg">{t('applyTransform')}</button>
            </>
        }>
             <div className="space-y-6">
                
                {/* Preview Area */}
                {selectedGlyphs.length > 0 && (
                    <div className="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-600 relative">
                         <div className="absolute top-1/2 left-0 w-full flex justify-between px-2 -translate-y-1/2 pointer-events-none">
                            <button onClick={() => setPreviewIndex(i => Math.max(0, i - 1))} disabled={previewIndex === 0} className="p-2 bg-white/80 dark:bg-black/50 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-black rounded-full shadow-sm disabled:opacity-0 pointer-events-auto transition-opacity"><LeftArrowIcon /></button>
                            <button onClick={() => setPreviewIndex(i => Math.min(selectedGlyphs.length - 1, i + 1))} disabled={previewIndex === selectedGlyphs.length - 1} className="p-2 bg-white/80 dark:bg-black/50 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-black rounded-full shadow-sm disabled:opacity-0 pointer-events-auto transition-opacity"><RightArrowIcon /></button>
                         </div>
                         <div className="w-40 h-40 bg-white dark:bg-gray-800 border rounded shadow-sm flex items-center justify-center">
                             {previewGlyph && transformedPreviewGlyphData && (
                                 <GlyphTile character={previewGlyph} glyphData={transformedPreviewGlyphData} strokeThickness={strokeThickness} />
                             )}
                         </div>
                         <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{previewGlyph?.name}</p>
                    </div>
                )}

                <p className="text-xs text-gray-500 italic text-center">{t('transformOriginCenter')}</p>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('scaleX')}</label>
                        <input type="number" step="0.1" value={scaleX} onChange={e => handleScaleXChange(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium mb-1">{t('scaleY')}</label>
                        <input type="number" step="0.1" value={scaleY} onChange={e => setScaleY(e.target.value)} disabled={lockAspect} className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50" />
                    </div>
                     <div className="col-span-2 flex items-center">
                        <input type="checkbox" id="lockAspect" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                        <label htmlFor="lockAspect" className="ml-2 text-sm">Lock Aspect Ratio</label>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">{t('rotate')}</label>
                    <div className="flex items-center gap-2">
                        <input type="range" min="-180" max="180" value={rotation} onChange={e => setRotation(e.target.value)} className="flex-grow" />
                        <input type="number" value={rotation} onChange={e => setRotation(e.target.value)} className="w-16 p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-center" />
                    </div>
                </div>

                <div className="flex gap-6 justify-center">
                     <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600">
                        <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                        <span>{t('flipHorizontal')}</span>
                    </label>
                     <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600">
                        <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                        <span>{t('flipVertical')}</span>
                    </label>
                </div>
            </div>
        </Modal>
    );
};

export default BulkEditWorkspace;
