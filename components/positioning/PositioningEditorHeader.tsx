
import React from 'react';
import { Character, FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, UndoIcon, PropertiesIcon, SaveIcon } from '../../constants';
import GlyphPropertiesPanel from '../GlyphPropertiesPanel';

interface PositioningEditorHeaderProps {
    targetLigature: Character;
    prevPair: any;
    nextPair: any;
    onNavigate: (direction: 'prev' | 'next' | 'back') => void;
    activeAttachmentClass: any;
    isLinked: boolean;
    isPivot: boolean;
    canEdit: boolean;
    isPositioned: boolean;
    onResetRequest: () => void;
    isGsubPair: boolean;
    isPropertiesPanelOpen: boolean;
    setIsPropertiesPanelOpen: (val: boolean) => void;
    lsb: number | undefined;
    setLsb: (val: number | undefined) => void;
    rsb: number | undefined;
    setRsb: (val: number | undefined) => void;
    metrics: FontMetrics;
    isAutosaveEnabled: boolean;
    onSaveRequest: () => void;
    isLargeScreen: boolean;
    isStripExpanded: boolean;
}

const PositioningEditorHeader: React.FC<PositioningEditorHeaderProps> = ({
    targetLigature, prevPair, nextPair, onNavigate, activeAttachmentClass, isLinked, isPivot,
    canEdit, isPositioned, onResetRequest, isGsubPair, isPropertiesPanelOpen, 
    setIsPropertiesPanelOpen, lsb, setLsb, rsb, setRsb, metrics, isAutosaveEnabled, 
    onSaveRequest, isLargeScreen, isStripExpanded
}) => {
    const { t } = useLocale();

    return (
        <header className="p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0 bg-white dark:bg-gray-800 z-10">
            <div className="flex-1 flex justify-start">
                <button onClick={() => onNavigate('back')} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    <BackIcon /><span className="hidden sm:inline">{t('back')}</span>
                </button>
            </div>

            <div className="flex-1 flex justify-center items-center gap-2 sm:gap-4">
                <button onClick={() => onNavigate('prev')} disabled={!prevPair} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"><LeftArrowIcon /></button>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--guide-font-family)' }}>{targetLigature.name}</h2>
                    <div className="flex justify-center mt-1">
                        {activeAttachmentClass && (
                            isLinked ? (
                                isPivot ? 
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-300">Class Representative</span> : 
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full dark:bg-blue-900/20 dark:text-blue-300">Synced</span>
                            ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full dark:bg-orange-900/20 dark:text-orange-300">Unlinked</span>
                            )
                        )}
                    </div>
                </div>
                <button onClick={() => onNavigate('next')} disabled={!nextPair} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"><RightArrowIcon /></button>
            </div>

            <div className="flex-1 flex justify-end items-center gap-2 overflow-x-auto no-scrollbar">
                <button onClick={onResetRequest} disabled={!isPositioned} className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 flex-shrink-0"><UndoIcon /></button>
                
                {isGsubPair && (
                    <div className="relative">
                        <button id="pos-properties-button" onClick={() => setIsPropertiesPanelOpen(!isPropertiesPanelOpen)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0"><PropertiesIcon /></button>
                        {isPropertiesPanelOpen && <GlyphPropertiesPanel lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb} metrics={metrics} onClose={() => setIsPropertiesPanelOpen(false)} />}
                    </div>
                )}
                
                {!isAutosaveEnabled && <button onClick={onSaveRequest} className="p-2 bg-indigo-600 text-white rounded-lg flex-shrink-0"><SaveIcon /></button>}
            </div>
        </header>
    );
};

export default React.memo(PositioningEditorHeader);
