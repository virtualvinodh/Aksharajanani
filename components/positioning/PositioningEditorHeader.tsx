import React, { useState } from 'react';
import { Character, FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, UndoIcon, PropertiesIcon, SaveIcon, LinkIcon, BrokenLinkIcon } from '../../constants';
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
        <header className="bg-gray-50 dark:bg-gray-800 p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0 z-20 shadow-sm">
            <div className="flex-1 flex justify-start">
                <button 
                    onClick={() => onNavigate('back')} 
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 active:scale-95"
                >
                    <BackIcon /><span className="hidden sm:inline">{t('back')}</span>
                </button>
            </div>

            <div className="flex-1 flex justify-center items-center gap-2 sm:gap-4">
                <button 
                    onClick={() => onNavigate('prev')} 
                    disabled={!prevPair} 
                    className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                >
                    <LeftArrowIcon />
                </button>
                
                <div className="text-center">
                    <h2 
                        className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight" 
                        style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                    >
                        {targetLigature.name}
                    </h2>
                    {activeAttachmentClass && (
                        <div className="flex justify-center items-center mt-1 gap-1.5 leading-none">
                            {isLinked ? (
                                isPivot ? 
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    Leader
                                </span> : 
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                    Synced
                                </span>
                            ) : (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full dark:bg-orange-900/20 dark:text-orange-300 border border-orange-100 dark:border-orange-800">
                                    Exception
                                </span>
                            )}
                        </div>
                    )}
                </div>
                
                <button 
                    onClick={() => onNavigate('next')} 
                    disabled={!nextPair} 
                    className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                >
                    <RightArrowIcon />
                </button>
            </div>

            <div className="flex-1 flex justify-end items-center gap-2">
                <button 
                    onClick={onResetRequest} 
                    disabled={!isPositioned} 
                    className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-yellow-400 transition-all active:scale-95 shadow-sm"
                    title={t('resetPosition')}
                >
                    <UndoIcon />
                    <span className="hidden xl:inline font-semibold">{t('reset')}</span>
                </button>
                
                {isGsubPair && (
                    <div className="relative">
                        <button 
                            id="pos-properties-button" 
                            onClick={() => setIsPropertiesPanelOpen(!isPropertiesPanelOpen)} 
                            className={`p-2 rounded-lg transition-all active:scale-95 ${isPropertiesPanelOpen ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300'}`}
                            title={t('glyphProperties')}
                        >
                            <PropertiesIcon />
                        </button>
                        {isPropertiesPanelOpen && (
                            <GlyphPropertiesPanel 
                                lsb={lsb} setLsb={setLsb} 
                                rsb={rsb} setRsb={setRsb} 
                                metrics={metrics} 
                                onClose={() => setIsPropertiesPanelOpen(false)} 
                            />
                        )}
                    </div>
                )}
                
                {!isAutosaveEnabled && (
                    <button 
                        onClick={onSaveRequest} 
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all active:scale-95 shadow-md"
                        title={t('save')}
                    >
                        <SaveIcon />
                        <span className="hidden xl:inline font-semibold">{t('save')}</span>
                    </button>
                )}
            </div>
        </header>
    );
};

export default React.memo(PositioningEditorHeader);