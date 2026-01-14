
import React, { useState, useRef, useEffect } from 'react';
import { Character, AppSettings, FontMetrics, GlyphData, CharacterSet, ComponentTransform } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, PropertiesIcon, TrashIcon, BroomIcon, SaveIcon, LinkIcon, BrokenLinkIcon, RefreshIcon, MoreIcon } from '../../constants';
import GlyphPropertiesPanel from '../GlyphPropertiesPanel';

interface DrawingEditorHeaderProps {
  character: Character;
  glyphData: GlyphData | undefined;
  prevCharacter: Character | null;
  nextCharacter: Character | null;
  onBackClick: () => void;
  onNavigate: (character: Character) => void;
  settings: AppSettings;
  metrics: FontMetrics;
  lsb: number | undefined;
  setLsb: (lsb: number | undefined) => void;
  rsb: number | undefined;
  setRsb: (rsb: number | undefined) => void;
  onDeleteClick: () => void;
  onClear: () => void;
  onSave: () => void;
  isLocked?: boolean;
  isComposite?: boolean;
  onRefresh?: () => void;
  allCharacterSets: CharacterSet[];
  onSaveConstruction: (type: 'drawing' | 'composite' | 'link', components: string[], transforms?: ComponentTransform[]) => void;
  onUnlock: () => void;
  onRelink: () => void;
  glyphClass?: Character['glyphClass'];
  setGlyphClass?: (val: Character['glyphClass']) => void;
  advWidth?: number | string;
  setAdvWidth?: (val: number | string | undefined) => void;
}

const DrawingEditorHeader: React.FC<DrawingEditorHeaderProps> = ({
  character, glyphData, prevCharacter, nextCharacter, onBackClick, onNavigate,
  settings, metrics, lsb, setLsb, rsb, setRsb, onDeleteClick, onClear, onSave,
  isLocked = false, isComposite = false, onRefresh, allCharacterSets, onSaveConstruction,
  onUnlock, onRelink, glyphClass, setGlyphClass, advWidth, setAdvWidth
}) => {
  const { t } = useLocale();
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-white dark:bg-gray-800 p-4 flex justify-between items-center shadow-md w-full flex-shrink-0 z-30 border-b dark:border-gray-700">
      <div className="flex-1 flex justify-start">
          <button
            onClick={onBackClick}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all active:scale-95"
          >
            <BackIcon />
            <span className="hidden sm:inline">{t('back')}</span>
          </button>
      </div>

      <div className="flex-1 flex justify-center items-center gap-2 sm:gap-4">
          <button
              onClick={() => onNavigate(prevCharacter!)}
              disabled={!prevCharacter}
              title={t('prevGlyph')}
              className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
          >
              <LeftArrowIcon />
          </button>
          <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                {character.name}
              </h2>
              <div className="flex justify-center mt-1 gap-1">
                {isLocked && <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">Linked</span>}
                {settings.showUnicodeValues && character.unicode !== undefined && (
                   <span className="text-gray-500 dark:text-gray-400 text-[10px] font-mono">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</span>
                )}
              </div>
          </div>
           <button
              onClick={() => onNavigate(nextCharacter!)}
              disabled={!nextCharacter}
              title={t('nextGlyph')}
              className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
          >
              <RightArrowIcon />
          </button>
      </div>

      <div className="flex-1 flex justify-end items-center gap-2 relative">
          <button
              id="glyph-properties-button"
              onClick={() => setIsPropertiesPanelOpen(p => !p)}
              className={`p-2 rounded-lg transition-all active:scale-95 ${isPropertiesPanelOpen ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300'}`}
              title={t('glyphProperties')}
          >
              <PropertiesIcon />
          </button>
          
          {isLocked && (
             <button onClick={onUnlock} title={t('unlockForDetailedEditing')} className="flex items-center gap-2 justify-center p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-semibold rounded-lg hover:bg-orange-200 transition-all active:scale-95">
                <BrokenLinkIcon className="w-5 h-5" />
            </button>
          )}

          {!!character.sourceLink && (
             <button onClick={onRelink} title={t('relinkGlyphTitle')} className="flex items-center gap-2 justify-center p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold rounded-lg hover:bg-blue-200 transition-all active:scale-95">
                <LinkIcon className="w-5 h-5" />
            </button>
          )}

          {(isLocked || isComposite) && (
              <button onClick={onRefresh} title={t('refresh')} className="p-2 bg-gray-200 dark:bg-gray-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-gray-300 transition-all active:scale-95">
                  <RefreshIcon />
              </button>
          )}

          {!isLocked && (
              <button onClick={onClear} title={t('clear')} className="p-2 bg-gray-200 dark:bg-gray-700 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-gray-300 transition-all active:scale-95">
                  <BroomIcon />
              </button>
          )}

          <div className="relative" ref={moreMenuRef}>
              <button onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 transition-all active:scale-95">
                  <MoreIcon />
              </button>
              {isMoreMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700 z-50">
                      <button onClick={() => { onDeleteClick(); setIsMoreMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                          <TrashIcon /> <span>{t('deleteGlyph')}</span>
                      </button>
                  </div>
              )}
          </div>

          {!settings.isAutosaveEnabled && (
              <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95">
                  <SaveIcon /> <span className="hidden xl:inline">{t('saveGlyph')}</span>
              </button>
          )}
          
          {isPropertiesPanelOpen && (
            <GlyphPropertiesPanel
              key={character.unicode}
              lsb={lsb} setLsb={setLsb} rsb={rsb} setRsb={setRsb} 
              metrics={metrics} onClose={() => setIsPropertiesPanelOpen(false)}
              character={character} glyphData={glyphData} allCharacterSets={allCharacterSets} onSaveConstruction={onSaveConstruction}
              glyphClass={glyphClass} setGlyphClass={setGlyphClass} advWidth={advWidth} setAdvWidth={setAdvWidth}
            />
          )}
      </div>
    </header>
  );
};

export default React.memo(DrawingEditorHeader);
