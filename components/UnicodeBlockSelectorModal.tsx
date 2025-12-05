
import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import { UnicodeBlock, Character, ScriptConfig, CharacterSet } from '../types';
import { getUnicodeBlocks, getAssignedCodepointsInBlock } from '../services/unicodeService';
import { SpinnerIcon } from '../constants';
import { useLayout } from '../contexts/LayoutContext';

declare var UnicodeProperties: any;

interface UnicodeBlockSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'createScript' | 'addBlocks';
  // For 'createScript' mode
  onSelectScript?: (script: ScriptConfig) => void;
  customScriptTemplate?: ScriptConfig;
  // For 'addBlocks' mode
  onAddBlock?: (chars: Character[]) => void;
  onCheckExists?: (unicode: number) => boolean;
}

const UnicodeBlockSelectorModal: React.FC<UnicodeBlockSelectorModalProps> = ({ 
  isOpen, onClose, mode, onSelectScript, customScriptTemplate, onAddBlock, onCheckExists 
}) => {
  const { t } = useLocale();
  const { showNotification } = useLayout();
  const [blocks, setBlocks] = useState<UnicodeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isConfirmingAdd, setIsConfirmingAdd] = useState(false);
  const [pendingCharacters, setPendingCharacters] = useState<Character[] | null>(null);
  const [pendingScriptConfig, setPendingScriptConfig] = useState<ScriptConfig | null>(null);
  
  const formId = "unicode-block-selector-form";

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSearchTerm('');
      setSelectedBlocks(new Set());
      setIsConfirmingAdd(false);
      setPendingCharacters(null);
      setPendingScriptConfig(null);
      getUnicodeBlocks().then(data => {
        setBlocks(data);
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  const filteredBlocks = useMemo(() => {
    if (!searchTerm) return blocks;
    return blocks.filter(block => block.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [blocks, searchTerm]);

  const handleToggleBlock = (blockName: string) => {
    setSelectedBlocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blockName)) {
        newSet.delete(blockName);
      } else {
        newSet.add(blockName);
      }
      return newSet;
    });
  };
  
  const handleConfirmAdd = () => {
    if (mode === 'createScript' && pendingScriptConfig && onSelectScript) {
      onSelectScript(pendingScriptConfig);
    } else if (mode === 'addBlocks' && pendingCharacters && onAddBlock) {
      onAddBlock(pendingCharacters);
    }
    onClose();
  };
  
  const handleCancelConfirm = () => {
    setIsConfirmingAdd(false);
    setPendingCharacters(null);
    setPendingScriptConfig(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBlocks.size === 0) return;

    const selectedBlockObjects = blocks.filter(b => selectedBlocks.has(b.name));
    const allCodepoints: number[] = selectedBlockObjects.flatMap(block => getAssignedCodepointsInBlock(block));
    
    const uniqueCodepoints = [...new Set(allCodepoints)];

    const allCharacters: Character[] = uniqueCodepoints
      .filter((cp: number) => (mode === 'addBlocks' && onCheckExists) ? !onCheckExists(cp) : true)
      .map(cp => {
        const category = UnicodeProperties.getCategory(cp);
        const glyphClass = (category === 'Mn' || category === 'Mc' || category === 'Me') ? 'mark' : 'base';
        
        const newChar: Character = {
          unicode: cp,
          name: String.fromCodePoint(cp),
          glyphClass: glyphClass,
          isCustom: true,
        };
        
        if (category === 'Mn') {
            newChar.advWidth = 0;
        }
        return newChar;
    });

    const hasMarks = allCharacters.some(c => c.glyphClass === 'mark');

    if (mode === 'createScript') {
        if (!onSelectScript || !customScriptTemplate) return;

        const customCharacterSet: CharacterSet = {
          nameKey: "customCharacters",
          characters: allCharacters,
        };

        const newScriptConfig: ScriptConfig = {
          ...customScriptTemplate,
          id: `custom_blocks_${Date.now()}`,
          nameKey: "customBlockFont",
          sampleText: "",
          characterSetData: [customCharacterSet],
          rulesData: { 'DFLT': {} },
          defaults: {
              ...customScriptTemplate.defaults,
              fontName: 'CustomBlockFont',
              editorMode: 'advanced',
          }
        };

        if (hasMarks) {
            setPendingScriptConfig(newScriptConfig);
            setIsConfirmingAdd(true);
        } else {
            onSelectScript(newScriptConfig);
            onClose();
        }
    } else { // 'addBlocks' mode
        if (!onAddBlock) return;
        
        if (allCharacters.length === 0) {
            showNotification(t('allGlyphsFromBlockExist'), 'info');
            onClose();
            return;
        }

        if (hasMarks) {
            setPendingCharacters(allCharacters);
            setIsConfirmingAdd(true);
        } else {
            onAddBlock(allCharacters);
            onClose();
        }
    }
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={isConfirmingAdd ? handleCancelConfirm : onClose}
      title={isConfirmingAdd ? t('incompleteFontTitle') : (mode === 'addBlocks' ? t('addBlockModalTitle') : t('unicodeBlockSelectorTitle'))}
      size="lg"
      footer={isConfirmingAdd ? (
          <>
            <button type="button" onClick={handleCancelConfirm} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
            <button type="button" onClick={handleConfirmAdd} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">{mode === 'addBlocks' ? t('addBlockAction') : t('startProject')}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
            <button type="submit" form={formId} disabled={isLoading || selectedBlocks.size === 0} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">{mode === 'addBlocks' ? t('addBlockAction') : t('startProject')}</button>
          </>
        )
      }
    >
      {isConfirmingAdd ? (
        <p>{t('warningAddBlockWithMarks')}</p>
      ) : (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col h-[70vh]">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{t('unicodeBlockSelectorDescription')}</p>
          {isLoading ? (
            <div className="flex items-center justify-center flex-grow">
              <SpinnerIcon />
              <span className="ml-2">{t('loadingUnicodeBlocks')}</span>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search blocks..."
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 mb-2 flex-shrink-0"
              />
              <div className="flex-grow overflow-y-auto border rounded-md p-2 dark:border-gray-600">
                {filteredBlocks.map(block => (
                  <label key={`${block.start}-${block.end}`} className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBlocks.has(block.name)}
                      onChange={() => handleToggleBlock(block.name)}
                      className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 dark:bg-gray-900"
                    />
                    <span className="ml-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                      {block.name}
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
                        (U+{block.start.toString(16).toUpperCase()}..U+{block.end.toString(16).toUpperCase()})
                      </span>
                    </span>
                  </label>
                ))}
                {filteredBlocks.length === 0 && <p className="text-sm text-center text-gray-500 py-4">{t('noResultsFound')}</p>}
              </div>
            </>
          )}
        </form>
      )}
    </Modal>
  );
};

export default UnicodeBlockSelectorModal;
