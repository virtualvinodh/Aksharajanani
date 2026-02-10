
import React, { useState, useRef, useEffect } from 'react';
import { Character, FontMetrics, CharacterSet, Path } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, UndoIcon, PropertiesIcon, SaveIcon, LinkIcon, BrokenLinkIcon, RefreshIcon, CheckIcon, TrashIcon, MoreIcon } from '../../constants';
import GlyphPropertiesPanel from '../GlyphPropertiesPanel';
import { GlyphDataAction } from '../../contexts/GlyphDataContext';

interface PositioningEditorHeaderProps {
    targetLigature: Character;
    prevPair: any;
    nextPair: any;
    onNavigate: (direction: 'prev' | 'next' | 'back') => void;
    onDelete: () => void;
    activeAttachmentClass: any;
    isLinked: boolean;
    isPivot: boolean;
    canEdit: boolean;
    isPositioned: boolean;
    onResetRequest: () => void;
    isGsubPair: boolean;
    lsb: number | undefined;
    setLsb: (val: number | undefined) => void;
    rsb: number | undefined;
    setRsb: (val: number | undefined) => void;
    metrics: FontMetrics;
    isAutosaveEnabled: boolean;
    onSaveRequest: () => void;
    isLargeScreen: boolean;
    isStripExpanded: boolean;
    isDirty: boolean;
    onConfirmPosition: () => void;
    onDetach?: () => void;
    allCharacterSets: CharacterSet[];
    onSaveConstruction: (type: 'drawing' | 'composite' | 'link', components: string[], transforms?: any) => void;
    characterDispatch: any;
    glyphDataDispatch: (action: GlyphDataAction) => void;
    onPathsChange: (paths: Path[]) => void;

    // ADD: Metadata props
    glyphClass?: Character['glyphClass'];
    setGlyphClass?: (val: Character['glyphClass']) => void;
    advWidth?: number | string;
    setAdvWidth?: (val: number | string | undefined) => void;
    liga?: string[];
    setLiga?: (val: string[] | undefined) => void;

    // ADD: Construction Props
    position?: [string, string];
    setPosition?: (val: [string, string] | undefined) => void;
    kern?: [string, string];
    setKern?: (val: [string, string] | undefined) => void;
    gpos?: string;
    setGpos?: (val: string | undefined) => void;
    gsub?: string;
    setGsub?: (val: string | undefined) => void;
}

const PositioningEditorHeader: React.FC<PositioningEditorHeaderProps> = ({
    targetLigature, prevPair, nextPair, onNavigate, onDelete, activeAttachmentClass, isLinked, isPivot,
    canEdit, isPositioned, onResetRequest, isGsubPair, lsb, setLsb, rsb, setRsb, metrics, isAutosaveEnabled, 
    onSaveRequest, isLargeScreen, isStripExpanded, isDirty, onConfirmPosition, onDetach,
    allCharacterSets, onSaveConstruction, characterDispatch, glyphDataDispatch, onPathsChange,
    glyphClass, setGlyphClass, advWidth, setAdvWidth, liga, setLiga,
    position, setPosition, kern, setKern, gpos, setGpos, gsub, setGsub
}) => {
    const { t } = useLocale();
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
            setIsMoreMenuOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


    const renderActionButton = () => {
        if (!canEdit) return null;

        if (isAutosaveEnabled) {
            if (!isPositioned) {
                return (
                    <button 
                        onClick={onConfirmPosition}
                        data-tour="header-accept-pos"
                        title="Accept Default Position"
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 shadow-sm"
                    >
                        <CheckIcon />
                        <span className="hidden xl:inline font-semibold">Accept</span>
                    </button>
                );
            }
            return null; // Autosave handles saves of dirty states
        } else {
            // Manual Save Mode
            if (!isPositioned && !isDirty) {
                 return (
                    <button 
                        onClick={onConfirmPosition}
                        data-tour="header-accept-pos"
                        title="Accept Default Position"
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 shadow-sm"
                    >
                        <CheckIcon />
                        <span className="hidden xl:inline font-semibold">Accept Position</span>
                    </button>
                );
            }
            if (isDirty) {
                 return (
                    <button 
                        onClick={onSaveRequest} 
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all active:scale-95 shadow-md"
                        title={t('save')}
                    >
                        <SaveIcon />
                        <span className="hidden xl:inline font-semibold">Save Changes</span>
                    </button>
                );
            }
            // Positioned and not dirty
            return (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 font-semibold rounded-lg cursor-default">
                    <SaveIcon />
                    <span className="hidden xl:inline">Saved</span>
                </div>
            );
        }
    };

    return (
        <header className="bg-gray-50 dark:bg-gray-800 p-4 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0 z-20 shadow-sm">
            <div className="flex-1 flex justify-start">
                <button 
                    onClick={() => onNavigate('back')} 
                    data-tour="header-back"
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

            <div className="flex-1 flex justify-end items-center gap-2 relative">
                {renderActionButton()}
                
                {onDetach && (
                    <button 
                        onClick={onDetach}
                        data-tour="header-detach-pos"
                        className="flex items-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-semibold rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-all active:scale-95 shadow-sm border border-orange-200 dark:border-orange-800"
                        title="Detach and Convert to Composite Glyph"
                    >
                        <BrokenLinkIcon />
                        <span className="hidden xl:inline">Detach</span>
                    </button>
                )}

                <button 
                    onClick={onResetRequest} 
                    disabled={!isPositioned} 
                    className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-yellow-400 transition-all active:scale-95 shadow-sm"
                    title={t('resetPosition')}
                >
                    <UndoIcon />
                    <span className="hidden xl:inline font-semibold">{t('reset')}</span>
                </button>

                {/* Properties Button - Always Visible */}
                <button 
                    onClick={() => setIsPropertiesPanelOpen(p => !p)}
                    className={`p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ${isPropertiesPanelOpen ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                    title={t('glyphProperties')}
                >
                    <PropertiesIcon />
                </button>
                
                {/* MORE MENU - Visible on All Screens */}
                <div ref={moreMenuRef} className="relative">
                    <button
                        onClick={() => setIsMoreMenuOpen(prev => !prev)}
                        className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 transition-all active:scale-95"
                        title={t('more')}
                    >
                        <MoreIcon />
                    </button>
                    {isMoreMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700 z-50">
                            <button onClick={() => { onDelete(); setIsMoreMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                <TrashIcon /> <span>{t('deleteGlyph')}</span>
                            </button>
                        </div>
                    )}
                </div>

                {isPropertiesPanelOpen && (
                <GlyphPropertiesPanel 
                    character={targetLigature}
                    lsb={lsb} setLsb={setLsb} 
                    rsb={rsb} setRsb={setRsb} 
                    metrics={metrics} 
                    onClose={() => setIsPropertiesPanelOpen(false)}
                    allCharacterSets={allCharacterSets}
                    onSaveConstruction={onSaveConstruction}
                    characterDispatch={characterDispatch}
                    glyphDataDispatch={glyphDataDispatch}
                    onPathsChange={onPathsChange}
                    // PASS: Metadata props
                    glyphClass={glyphClass} setGlyphClass={setGlyphClass}
                    advWidth={advWidth} setAdvWidth={setAdvWidth}
                    liga={liga} setLiga={setLiga}
                    // PASS: Construction props
                    position={position} setPosition={setPosition}
                    kern={kern} setKern={setKern}
                    gpos={gpos} setGpos={setGpos}
                    gsub={gsub} setGsub={setGsub}
                    
                    // Hide structural editing in this specific workspace
                    disableStructuralEditing={true}
                />
                )}
            </div>
        </header>
    );
};

export default React.memo(PositioningEditorHeader);
