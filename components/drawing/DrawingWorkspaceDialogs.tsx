import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import Modal from '../Modal';
import { SaveIcon, TransformIcon } from '../../constants';
import { sanitizeIdentifier } from '../../utils/stringUtils';
import { GlyphData } from '../../types';
import { renderPaths, getAccurateGlyphBBox } from '../../services/glyphRenderService';
import { transformGlyphPaths } from '../../hooks/useBatchOperations';
import { useTheme } from '../../contexts/ThemeContext';

interface DrawingWorkspaceDialogsProps {
    modalState: { type: 'create' | 'rename', index?: number, isOpen: boolean };
    setModalState: (s: any) => void;
    modalInputValue: string;
    setModalInputValue: (v: string) => void;
    showNamingHint: boolean;
    handleModalSubmit: (e: React.FormEvent) => void;
    
    isTransformOpen: boolean;
    setIsTransformOpen: (v: boolean) => void;
    onBulkTransform: (sx: number, sy: number, r: number, fh: boolean, fv: boolean) => void;
    
    isPropertiesOpen: boolean;
    setIsPropertiesOpen: (v: boolean) => void;
    onBulkProperties: (l: string, r: string) => void;
    
    isDeleteOpen: boolean;
    setIsDeleteOpen: (v: boolean) => void;
    onBulkDelete: () => void;
    
    selectionSize: number;
    previewSample?: GlyphData;
    strokeThickness?: number;
}

const DrawingWorkspaceDialogs: React.FC<DrawingWorkspaceDialogsProps> = (props) => {
    const { t } = useLocale();
    const { theme } = useTheme();
    
    // Internal state for sub-modals to avoid prop-drilling complex numeric values
    const [lsb, setLsb] = useState('');
    const [rsb, setRsb] = useState('');
    const [scaleX, setScaleX] = useState('1.0');
    const [scaleY, setScaleY] = useState('1.0');
    const [rotation, setRotation] = useState('0');
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [lockAspect, setLockAspect] = useState(true);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!props.isTransformOpen || !props.previewSample || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const size = canvas.width; // Assume square
        ctx.clearRect(0, 0, size, size);
        
        const originalPaths = props.previewSample.paths;
        const thickness = props.strokeThickness || 15;
        
        // Calculate transform
        const sX = parseFloat(scaleX) || 1;
        const sY = parseFloat(scaleY) || 1;
        const rot = parseFloat(rotation) || 0;
        
        const transformedPaths = transformGlyphPaths(originalPaths, thickness, sX, sY, rot, flipH, flipV);
        
        const bbox = getAccurateGlyphBBox(originalPaths, thickness);
        if (!bbox) return;
        
        const contentCenterX = bbox.x + bbox.width / 2;
        const contentCenterY = bbox.y + bbox.height / 2;
        
        // Dynamic fit padding
        const padding = 40;
        const availableDim = size - (padding * 2);
        // Ensure divisor isn't zero or negative
        const maxDim = Math.max(bbox.width, bbox.height, 100); 
        
        const scale = availableDim / maxDim;
        
        // Draw
        ctx.save();
        
        // Move canvas origin to center
        ctx.translate(size / 2, size / 2);
        ctx.scale(scale, scale);
        // Move glyph origin so its center aligns with canvas center
        // Note: Coordinates are typically "font units", so y-up vs y-down matters if not careful, 
        // but here we just center the bbox.
        ctx.translate(-contentCenterX, -contentCenterY);
        
        // 1. Draw Origin Marker (at glyph center)
        ctx.save();
        ctx.strokeStyle = theme === 'dark' ? '#555' : '#e5e7eb';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        const markLen = Math.max(bbox.width, bbox.height) / 4;
        ctx.moveTo(contentCenterX - markLen, contentCenterY);
        ctx.lineTo(contentCenterX + markLen, contentCenterY);
        ctx.moveTo(contentCenterX, contentCenterY - markLen);
        ctx.lineTo(contentCenterX, contentCenterY + markLen);
        ctx.stroke();
        ctx.restore();

        // 2. Ghost (Original)
        ctx.globalAlpha = 0.3;
        renderPaths(ctx, originalPaths, { 
            strokeThickness: thickness, 
            color: theme === 'dark' ? '#fff' : '#000' 
        });
        ctx.globalAlpha = 1.0;
        
        // 3. Active (Transformed)
        renderPaths(ctx, transformedPaths, { 
            strokeThickness: thickness, 
            color: theme === 'dark' ? '#818CF8' : '#4f46e5' 
        });

        ctx.restore();

    }, [props.isTransformOpen, scaleX, scaleY, rotation, flipH, flipV, props.previewSample, props.strokeThickness, theme]);

    return (
        <>
            {/* 1. Group Management Modal */}
            <Modal 
                isOpen={props.modalState.isOpen} 
                onClose={() => props.setModalState(prev => ({ ...prev, isOpen: false }))} 
                title={props.modalState.type === 'create' ? t('newGroup') : t('renameGroup')} 
                size="sm" 
                footer={<><button onClick={() => props.setModalState(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">{t('cancel')}</button><button onClick={props.handleModalSubmit} disabled={!props.modalInputValue.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-indigo-400">{t('save')}</button></>}
            >
                <form onSubmit={props.handleModalSubmit}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('groupName')}</label>
                    <input 
                        type="text" 
                        value={props.modalInputValue} 
                        onChange={e => props.setModalInputValue(sanitizeIdentifier(e.target.value))} 
                        autoFocus 
                        className={`w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none ${props.showNamingHint ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}
                    />
                    {props.showNamingHint && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium animate-fade-in-up">
                            {t('namingRestrictionHint')}
                        </p>
                    )}
                </form>
            </Modal>

            {/* 2. Bulk Properties Modal */}
            <Modal 
                isOpen={props.isPropertiesOpen} 
                onClose={() => props.setIsPropertiesOpen(false)} 
                title={`${t('editProperties')} (${props.selectionSize})`} 
                footer={<><button onClick={() => props.setIsPropertiesOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => props.onBulkProperties(lsb, rsb)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{t('save')}</button></>}
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">Leave fields blank to keep existing values.</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('leftSpace')} (LSB)</label>
                            <input type="text" value={lsb} onChange={e => setLsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('rightSpace')} (RSB)</label>
                            <input type="text" value={rsb} onChange={e => setRsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* 3. Bulk Transform Modal */}
            <Modal 
                isOpen={props.isTransformOpen} 
                onClose={() => props.setIsTransformOpen(false)} 
                title={t('transformGlyphsTitle', { count: props.selectionSize })} 
                footer={<><button onClick={() => props.setIsTransformOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => props.onBulkTransform(parseFloat(scaleX)||1, parseFloat(scaleY)||1, parseFloat(rotation)||0, flipH, flipV)} className="px-4 py-2 bg-green-600 text-white rounded-lg">{t('applyTransform')}</button></>}
            >
                <div className="space-y-6">
                    {props.previewSample && (
                        <div className="flex justify-center bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-inner">
                             <canvas ref={canvasRef} width={240} height={240} className="w-32 h-32 sm:w-60 sm:h-60" />
                        </div>
                    )}

                    <p className="text-xs text-gray-500 italic text-center">{t('transformOriginCenter')}</p>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                        <div className="col-span-1">
                            <label className="block text-xs sm:text-sm font-medium mb-1">{t('scaleX')}</label>
                            <input type="text" value={scaleX} onChange={e => { setScaleX(e.target.value); if(lockAspect) setScaleY(e.target.value); }} className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs sm:text-sm font-medium mb-1">{t('scaleY')}</label>
                            <input type="text" value={scaleY} onChange={e => setScaleY(e.target.value)} disabled={lockAspect} className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50" />
                        </div>
                        <div className="col-span-2 flex items-center">
                            <input type="checkbox" id="lockAspect" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                            <label htmlFor="lockAspect" className="ml-2 text-sm">{t('lockAspectRatio')}</label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('rotate')}</label>
                        <div className="flex items-center gap-2">
                            <input type="range" min="-180" max="180" value={rotation} onChange={e => setRotation(e.target.value)} className="flex-grow accent-indigo-600" />
                            <input type="text" value={rotation} onChange={e => setRotation(e.target.value)} className="w-16 p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 text-center font-mono" />
                        </div>
                    </div>
                    <div className="flex gap-6 justify-center">
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600">
                            <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                            <span className="text-sm">{t('flipHorizontal')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded border dark:border-gray-600">
                            <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="h-4 w-4 rounded text-indigo-600" />
                            <span className="text-sm">{t('flipVertical')}</span>
                        </label>
                    </div>
                </div>
            </Modal>

            {/* 4. Bulk Delete Confirm */}
            <Modal 
                isOpen={props.isDeleteOpen} 
                onClose={() => props.setIsDeleteOpen(false)} 
                title={t('confirmDeleteSelectedTitle')} 
                titleClassName="text-red-600" 
                footer={<><button onClick={() => props.setIsDeleteOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={props.onBulkDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg">{t('delete')}</button></>}
            >
                <p>{t('confirmDeleteSelectedMessage', { count: props.selectionSize })}</p>
            </Modal>
        </>
    );
};

export default React.memo(DrawingWorkspaceDialogs);