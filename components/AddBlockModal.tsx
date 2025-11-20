import React, { useState, useEffect, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import { UnicodeBlock, Character } from '../types';
import { getUnicodeBlocks, getAssignedCodepointsInBlock } from '../services/unicodeService';
import { SpinnerIcon } from '../constants';

declare var UnicodeProperties: any;

interface AddBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (chars: Character[]) => void;
  onCheckExists: (unicode: number) => boolean;
}

const AddBlockModal: React.FC<AddBlockModalProps> = ({ isOpen, onClose, onAddBlock, onCheckExists }) => {
  const { t } = useLocale();
  const [blocks, setBlocks] = useState<UnicodeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBlockRange, setSelectedBlockRange] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isConfirmingAdd, setIsConfirmingAdd] = useState(false);
  const [pendingCharacters, setPendingCharacters] = useState<Character[] | null>(null);
  
  const formId = "add-block-form";

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSearchTerm('');
      setSelectedBlockRange('');
      setIsConfirmingAdd(false);
      setPendingCharacters(null);
      getUnicodeBlocks().then(data => {
        setBlocks(data);
        setIsLoading(false);
      });
    }
  }, [isOpen]);

  const filteredBlocks = useMemo(() => {
    if (!searchTerm) {
      return blocks;
    }
    return blocks.filter(block =>
      block.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [blocks, searchTerm]);

  useEffect(() => {
    if (filteredBlocks.length > 0) {
      setSelectedBlockRange(`${filteredBlocks[0].start}..${filteredBlocks[0].end}`);
    } else {
      setSelectedBlockRange('');
    }
  }, [filteredBlocks]);

  const handleConfirmAdd = () => {
    if (pendingCharacters) {
      onAddBlock(pendingCharacters);
    }
    onClose(); // This closes the modal and resets all states via the useEffect(isOpen)
  };
  
  const handleCancelConfirm = () => {
    setIsConfirmingAdd(false);
    setPendingCharacters(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlockRange) return;

    const [startStr, endStr] = selectedBlockRange.split('..');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);

    const block = blocks.find(b => b.start === start && b.end === end);
    if (!block) return;
    
    const codepoints = getAssignedCodepointsInBlock(block);
    
    const newCharacters = codepoints
      .filter(cp => !onCheckExists(cp))
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
      
    const hasMarks = newCharacters.some(c => c.glyphClass === 'mark');
    
    if (hasMarks) {
        setPendingCharacters(newCharacters);
        setIsConfirmingAdd(true);
    } else {
        onAddBlock(newCharacters);
        onClose();
    }
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={isConfirmingAdd ? handleCancelConfirm : onClose}
      title={isConfirmingAdd ? t('incompleteFontTitle') : t('addBlockModalTitle')}
      size="md"
      footer={isConfirmingAdd ? (
          <>
            <button type="button" onClick={handleCancelConfirm} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
            <button type="button" onClick={handleConfirmAdd} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">{t('addBlockAction')}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
            <button type="submit" form={formId} disabled={isLoading || !selectedBlockRange} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">{t('addBlockAction')}</button>
          </>
        )
      }
    >
      {isConfirmingAdd ? (
          <p>{t('warningAddBlockWithMarks')}</p>
      ) : (
        <form id={formId} onSubmit={handleSubmit}>
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <SpinnerIcon />
              <span className="ml-2">{t('loadingUnicodeBlocks')}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="block-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search
                </label>
                <input
                  id="block-search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="e.g., Latin, Cyrillic, Symbols..."
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="block-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Unicode Block
                </label>
                <select
                  id="block-select"
                  value={selectedBlockRange}
                  onChange={e => setSelectedBlockRange(e.target.value)}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2"
                  size={Math.min(10, filteredBlocks.length)}
                >
                  {filteredBlocks.map(block => (
                    <option key={`${block.start}-${block.end}`} value={`${block.start}..${block.end}`}>
                      {block.name} (U+{block.start.toString(16).toUpperCase()}..U+{block.end.toString(16).toUpperCase()})
                    </option>
                  ))}
                </select>
                {filteredBlocks.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('noResultsFound')}</p>
                )}
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
};

export default AddBlockModal;
