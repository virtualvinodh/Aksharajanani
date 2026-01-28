import React, {useState, useRef, useEffect} from 'react';
import { Character, AppSettings, CharacterSet, Path, FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, SparklesIcon, SaveIcon, CheckIcon, UndoIcon, PropertiesIcon, TrashIcon, MoreIcon, BrokenLinkIcon, LinkIcon, RefreshIcon } from '../../constants';
import GlyphPropertiesPanel from '../GlyphPropertiesPanel';
import { GlyphDataAction } from '../../contexts/GlyphDataContext';

interface KerningEditorHeaderProps {
    pair: { left: Character, right: Character };
    onClose: () => void;
    onDelete: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
    hasPrev: boolean;
    hasNext: boolean;
    onAutoKern: () => void;
    isAutoKerning: boolean;
    onSave: () => void;
    onRemove: () => void;
    isDirty: boolean;
    settings: AppSettings;
    isKerned: boolean;
    allCharacterSets: CharacterSet[];
    character: Character; // The virtual character for this pair
    onDetach?: () => void;
    onSaveConstruction: (...args: any) => void;
    characterDispatch: any;
    glyphDataDispatch: (action: GlyphDataAction) => void;
    onPathsChange: (paths: Path[]) => void;
    
    // New Props for Properties Panel
    lsb: number | undefined;
    setLsb: (v: number | undefined) => void;
    rsb: number | undefined;
    setRsb: (v: number | undefined) => void;
    metrics: FontMetrics;
    showPropertiesButton?: boolean;

    // ADD: Accept all construction-related props to pass down
    position?: [string, string];
    setPosition?: (val: [string, string] | undefined) => void;
    kern?: [string, string];
    setKern?: (val: [string, string] | undefined) => void;
    gpos?: string;
    setGpos?: (val: string | undefined) => void;
    gsub?: string;
    setGsub?: (val: string | undefined) => void;
    liga?: string[];
    setLiga?: (val: string[] | undefined) => void;
}

const KerningEditorHeader: React.FC<KerningEditorHeaderProps> = (props) => {
    const { t } = useLocale();
    const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

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

    const navButtonClass = "p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all";
    
    const useKerningTerm = props.settings.editorMode === 'advanced' || props.settings.preferKerningTerm;
    const autoLabel = useKerningTerm ? t('autoKern') : "Auto-space";

    const renderActionButton = () => {
        if (props.settings.isAutosaveEnabled) {
            if (!props.isKerned) {
                return (
                    <button 
                        onClick={props.onSave} 
                        title="Accept Default" 
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 shadow-sm"
                    >
                        <CheckIcon />
                        <span className="hidden xl:inline font-semibold">Accept</span>
                    </button>
                );
            }
            return null;
        } else {
            if (!props.isKerned && !props.isDirty) {
                 return (
                    <button 
                        onClick={props.onSave} 
                        title="Accept Default Value" 
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all active:scale-95 shadow-sm"
                    >
                        <CheckIcon />
                        <span className="hidden xl:inline font-semibold">Accept Value</span>
                    </button>
                );
            }
            if (props.isDirty) {
                 return (
                    <button 
                        onClick={props.onSave} 
                        title={t('save')} 
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all active:scale-95 shadow-md"
                    >
                        <SaveIcon />
                        <span className="hidden xl:inline font-semibold">Save Changes</span>
                    </button>
                );
            }
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
                    onClick={props.onClose} 
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 active:scale-95"
                >
                    <BackIcon />
                    <span className="hidden sm:inline">{t('back')}</span>
                </button>
            </div>

            <div className="flex-1 flex items-center gap-2 sm:gap-4 justify-center">
                <button onClick={() => props.onNavigate('prev')} disabled={!props.hasPrev} className={navButtonClass}>
                    <LeftArrowIcon />
                </button>
                
                <div className="text-center px-2">
                    <h2 
                        className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs leading-tight" 
                        style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                    >
                        {props.pair.left.name} + {props.pair.right.name}
                    </h2>
                </div>
                
                <button onClick={() => props.onNavigate('next')} disabled={!props.hasNext} className={navButtonClass}>
                    <RightArrowIcon />
                </button>
            </div>

            <div className="flex-1 flex justify-end items-center gap-2 relative">
                {renderActionButton()}
                
                <button 
                    onClick={props.onAutoKern} 
                    disabled={props.isAutoKerning} 
                    title={autoLabel} 
                    className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-teal-400 transition-all active:scale-95 shadow-sm"
                >
                    {props.isAutoKerning ? (
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                        <SparklesIcon />
                    )}
                    <span className="hidden xl:inline font-semibold">{autoLabel}</span>
                </button>
                
                {props.onDetach && (
                    <button 
                        onClick={props.onDetach}
                        className="flex items-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-semibold rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-all active:scale-95 shadow-sm border border-orange-200 dark:border-orange-800"
                        title="Detach and Convert to Composite Glyph"
                    >
                        <BrokenLinkIcon />
                        <span className="hidden xl:inline">Detach</span>
                    </button>
                )}

                <button 
                    onClick={props.onRemove} 
                    title={t('reset')} 
                    disabled={!props.isKerned}
                    className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-yellow-400 transition-all active:scale-95 shadow-sm"
                >
                    <UndoIcon />
                    <span className="hidden xl:inline font-semibold">{t('reset')}</span>
                </button>
                
                {/* Properties Button - Conditionally Visible */}
                {props.showPropertiesButton && (
                    <button 
                        onClick={() => setIsPropertiesPanelOpen(prev => !prev)}
                        className={`p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ${isPropertiesPanelOpen ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                        title={t('glyphProperties')}
                    >
                        <PropertiesIcon />
                    </button>
                )}
                
                {/* MORE MENU - Visible on All Screens */}
                <div ref={moreMenuRef} className="relative">
                    <button
                        onClick={() => setIsMoreMenuOpen(prev => !prev)}
                        className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        title={t('more')}
                    >
                        <MoreIcon />
                    </button>
                    {isMoreMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700 z-50">
                            <button onClick={() => { props.onDelete(); setIsMoreMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                <TrashIcon /> <span>{t('deleteGlyph')}</span>
                            </button>
                        </div>
                    )}
                </div>
                {isPropertiesPanelOpen && (
                    <GlyphPropertiesPanel 
                        lsb={props.lsb} setLsb={props.setLsb} 
                        rsb={props.rsb} setRsb={props.setRsb}
                        metrics={props.metrics} 
                        onClose={() => setIsPropertiesPanelOpen(false)}
                        character={props.character}
                        allCharacterSets={props.allCharacterSets}
                        onSaveConstruction={props.onSaveConstruction}
                        characterDispatch={props.characterDispatch}
                        glyphDataDispatch={props.glyphDataDispatch}
                        onPathsChange={props.onPathsChange}
                        kern={props.kern}
                        setKern={props.setKern}
                        position={props.position}
                        setPosition={props.setPosition}
                        gpos={props.gpos}
                        setGpos={props.setGpos}
                        gsub={props.gsub}
                        /* FIX: Corrected typo 'setGsub' to 'props.setGsub' to resolve the 'Cannot find name' error. */
                        setGsub={props.setGsub}
                        liga={props.liga}
                        setLiga={props.setLiga}
                    />
                )}
            </div>
        </header>
    );
};

export default React.memo(KerningEditorHeader);