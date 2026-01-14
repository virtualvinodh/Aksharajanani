
import React from 'react';
import { Character, FontMetrics, Path } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import Modal from '../Modal';
import UnsavedChangesModal from '../UnsavedChangesModal';
import DeleteConfirmationModal from '../DeleteConfirmationModal';
import ImageTracerModal from '../modals/ImageTracerModal';
import { DRAWING_CANVAS_SIZE } from '../../constants';

interface DrawingConfirmationStackProps {
    isUnsavedModalOpen: boolean;
    closeUnsavedModal: () => void;
    confirmSave: () => void;
    confirmDiscard: () => void;
    
    isDeleteConfirmOpen: boolean;
    setIsDeleteConfirmOpen: (val: boolean) => void;
    onDelete: (unicode: number) => void;
    character: Character;
    dependentsCount: number;

    isUnlockConfirmOpen: boolean;
    setIsUnlockConfirmOpen: (val: boolean) => void;
    onUnlock: () => void;

    isRelinkConfirmOpen: boolean;
    setIsRelinkConfirmOpen: (val: boolean) => void;
    onRelink: () => void;

    isConstructionWarningOpen: boolean;
    setIsConstructionWarningOpen: (val: boolean) => void;
    pendingConstruction: any;
    executeConstructionUpdate: (type: any, components: any, transforms: any) => void;

    isTracerModalOpen: boolean;
    setIsTracerModalOpen: (val: boolean) => void;
    tracerImageSrc: string | null;
    handleInsertTracedSVG: (paths: Path[]) => void;
    metrics: FontMetrics;
}

const DrawingConfirmationStack: React.FC<DrawingConfirmationStackProps> = (props) => {
    const { t } = useLocale();

    return (
        <>
            <UnsavedChangesModal 
                isOpen={props.isUnsavedModalOpen} 
                onClose={props.closeUnsavedModal} 
                onSave={props.confirmSave} 
                onDiscard={props.confirmDiscard} 
            />
            
            <DeleteConfirmationModal 
                isOpen={props.isDeleteConfirmOpen} 
                onClose={() => props.setIsDeleteConfirmOpen(false)} 
                onConfirm={() => { props.onDelete(props.character.unicode!); props.setIsDeleteConfirmOpen(false); }} 
                character={props.character} 
                isStandardGlyph={!props.character.isCustom} 
                dependentCount={props.dependentsCount}
            />

            <Modal 
                isOpen={props.isUnlockConfirmOpen} 
                onClose={() => props.setIsUnlockConfirmOpen(false)} 
                title={t('unlockGlyphTitle')} 
                titleClassName="text-yellow-600 dark:text-yellow-400" 
                footer={<><button onClick={() => props.setIsUnlockConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={props.onUnlock} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg">{t('unlock')}</button></>}
            >
                <p>{t('unlockGlyphMessage')}</p>
            </Modal>

            <Modal 
                isOpen={props.isRelinkConfirmOpen} 
                onClose={() => props.setIsRelinkConfirmOpen(false)} 
                title={t('relinkGlyphTitle')} 
                titleClassName="text-yellow-600 dark:text-yellow-400" 
                footer={<><button onClick={() => props.setIsRelinkConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={props.onRelink} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg">{t('relink')}</button></>}
            >
                <p>{t('relinkGlyphMessage')}</p>
            </Modal>

            <Modal 
                isOpen={props.isConstructionWarningOpen} 
                onClose={() => props.setIsConstructionWarningOpen(false)} 
                title="Overwrite Glyph Data?" 
                titleClassName="text-red-600 dark:text-red-400"
                footer={<><button onClick={() => props.setIsConstructionWarningOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button><button onClick={() => props.pendingConstruction && props.executeConstructionUpdate(props.pendingConstruction.type, props.pendingConstruction.components, props.pendingConstruction.transforms)} className="px-4 py-2 bg-red-600 text-white rounded-lg">Overwrite & Reconstruct</button></>}
            >
                <p>Switching construction mode will discard your current manual drawings and replace them with the selected components. This cannot be undone.</p>
            </Modal>

            <ImageTracerModal 
                isOpen={props.isTracerModalOpen} 
                onClose={() => props.setIsTracerModalOpen(false)} 
                imageSrc={props.tracerImageSrc} 
                onInsertSVG={props.handleInsertTracedSVG} 
                drawingCanvasSize={DRAWING_CANVAS_SIZE} 
                metrics={props.metrics} 
            />
        </>
    );
};

export default React.memo(DrawingConfirmationStack);
