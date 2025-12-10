

import React, { useState, useRef, useEffect } from 'react';
import { Character, AppSettings, FontMetrics, GlyphData, CharacterSet } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, PropertiesIcon, TrashIcon, BroomIcon, SaveIcon, RedoIcon, MoreIcon } from '../constants';
import GlyphPropertiesPanel from './GlyphPropertiesPanel';

interface DrawingModalHeaderProps {
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
  onSaveConstruction: (type: 'drawing' | 'composite' | 'link', components: string[], transforms?: (number | 'absolute' | 'touching')[][]) => void;
}

const DrawingModalHeader: React.FC<DrawingModalHeaderProps> = ({
  character, glyphData, prevCharacter, nextCharacter, onBackClick, onNavigate,
  settings, metrics, lsb, setLsb, rsb, setRsb, onDeleteClick, onClear, onSave,
  isLocked = false, isComposite = false, onRefresh, allCharacterSets, onSaveConstruction
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-gray-50 dark:bg-gray-800 p-4 flex justify-between items-center shadow-md w-full flex-shrink-0 z-20">
      <div className="flex-1 flex justify-start">
          <button
          onClick={onBackClick}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
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
              className="flex items-center gap-2 p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
              <LeftArrowIcon />
              <span className="hidden sm:inline text-xs lg:text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>{prevCharacter?.name}</span>
          </button>
          <div className="text-center">
              <h2 
              className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white"
              style={{
                  fontFamily: 'var(--guide-font-family)',
                  fontFeatureSettings: 'var(--guide-font-feature-settings)'
              }}
              >
              {character.name}
              </h2>
              {settings.showUnicodeValues && character.unicode !== undefined && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
              )}
          </div>
           <button
              onClick={() => onNavigate(nextCharacter!)}
              disabled={!nextCharacter}
              title={t('nextGlyph')}
              className="flex items-center gap-2 p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
              <span className="hidden sm:inline text-xs lg:text-sm" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>{nextCharacter?.name}</span>
              <RightArrowIcon />
          </button>
      </div>


      <div className="flex-1 flex justify-end items-center gap-2 relative">
          
          {/* Properties Panel Toggle (Desktop Only) */}
          <button
              id="glyph-properties-button"
              onClick={() => setIsPropertiesPanelOpen(p => !p)}
              title={t('glyphProperties')}
              className="hidden sm:flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
          >
              <PropertiesIcon />
              <span className="hidden xl:inline">{t('glyphProperties')}</span>
          </button>
          
          {/* Refresh (Universal) */}
          {(isLocked || isComposite) && (
              <button
                  onClick={() => onRefresh?.()}
                  title={t('refresh')}
                  className="flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
              >
                  <RedoIcon />
                  <span className="hidden xl:inline">{t('refresh')}</span>
              </button>
          )}

          {/* Clear (Universal) */}
          {!isLocked && (
              <button
                  onClick={onClear}
                  title={t('clear')}
                  className="flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-orange-600 dark:text-orange-400 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
              >
                  <BroomIcon />
                  <span className="hidden xl:inline">{t('clear')}</span>
              </button>
          )}

          {/* Delete (Desktop Only) */}
          <button
              onClick={onDeleteClick}
              title={t('deleteGlyph')}
              className="hidden sm:flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-red-600 dark:text-red-400 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
          >
              <TrashIcon />
              <span className="hidden xl:inline">{t('deleteGlyph')}</span>
          </button>

          {/* Manual Save Button (Universal) */}
          {!settings.isAutosaveEnabled && (
              <button
                  onClick={onSave}
                  className="flex items-center gap-2 justify-center p-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200"
                  title={t('saveGlyph')}
              >
                  <SaveIcon />
                  <span className="hidden xl:inline">{t('saveGlyph')}</span>
              </button>
          )}

          {/* MOBILE MENU (Hidden on Desktop) */}
          <div className="relative sm:hidden" ref={moreMenuRef}>
              <button
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className="flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                  title={t('more')}
              >
                  <MoreIcon />
              </button>

              {isMoreMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700 z-50">
                       {/* Properties (Mobile) */}
                       <button
                           onClick={() => { setIsPropertiesPanelOpen(true); setIsMoreMenuOpen(false); }}
                           className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                       >
                           <PropertiesIcon />
                           <span>{t('glyphProperties')}</span>
                       </button>

                      {/* Delete (Mobile) */}
                      <button
                          onClick={() => { onDeleteClick(); setIsMoreMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                          <TrashIcon />
                          <span>{t('deleteGlyph')}</span>
                      </button>
                  </div>
              )}
          </div>
          
          {/* Properties Panel - Anchored to container */}
          {isPropertiesPanelOpen && (
            <GlyphPropertiesPanel
              lsb={lsb}
              setLsb={setLsb}
              rsb={rsb}
              setRsb={setRsb}
              metrics={metrics}
              onClose={() => setIsPropertiesPanelOpen(false)}
              character={character}
              glyphData={glyphData}
              allCharacterSets={allCharacterSets}
              onSaveConstruction={onSaveConstruction}
            />
          )}

      </div>
    </header>
  );
};

export default React.memo(DrawingModalHeader);