
import React, { useState } from 'react';
import { Character, AppSettings, FontMetrics, GlyphData, CharacterSet } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon, LeftArrowIcon, RightArrowIcon, PropertiesIcon, TrashIcon, BroomIcon, SaveIcon, RedoIcon } from '../constants';
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

  return (
    <header className="bg-gray-5 dark:bg-gray-800 p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
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
              {settings.editorMode === 'advanced' && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">U+{character.unicode?.toString(16).toUpperCase().padStart(4, '0')}</p>
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


      <div className="flex-1 flex justify-end items-center gap-2">
          {settings.editorMode === 'advanced' && (
            <div className="relative">
              <button
                id="glyph-properties-button"
                onClick={() => setIsPropertiesPanelOpen(p => !p)}
                title={t('glyphProperties')}
                className="flex items-center gap-2 justify-center p-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
              >
                <PropertiesIcon />
              </button>
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
          )}
          {settings.editorMode === 'advanced' && (
              <button
                  onClick={onDeleteClick}
                  title={t('deleteGlyph')}
                  className="flex items-center gap-2 justify-center px-4 py-2 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 transition-colors duration-200"
              >
                  <TrashIcon />
                  <span className="hidden sm:inline">{t('deleteGlyph')}</span>
              </button>
          )}
          
          {(isLocked || isComposite) && (
            <button
                onClick={onRefresh}
                title={t('refreshGlyph')}
                className="flex items-center gap-2 justify-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-200"
            >
                <RedoIcon />
                <span className="hidden sm:inline">{t('refresh')}</span>
            </button>
          )}
          
          {!isLocked && (
            <button
                onClick={onClear}
                className="flex items-center gap-2 justify-center px-4 py-2 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors duration-200"
            >
                <BroomIcon />
                <span className="hidden sm:inline">{t('clear')}</span>
            </button>
          )}

          {!settings.isAutosaveEnabled && (
              <button
                  onClick={onSave}
                  className="flex items-center gap-2 justify-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200"
              >
                  <SaveIcon />
                  <span className="hidden sm:inline">{t('saveGlyph')}</span>
              </button>
          )}
      </div>
    </header>
  );
};

export default React.memo(DrawingModalHeader);
