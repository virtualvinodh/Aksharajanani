import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { Character } from '../types';
import Modal from './Modal';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  character: Character;
  isStandardGlyph?: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm, character, isStandardGlyph = false }) => {
  const { t } = useLocale();
  
  const title = t('deleteGlyphTitle');
  const message = isStandardGlyph
    ? t('deleteStandardGlyphMessage', { name: character.name })
    : t('deleteGlyphMessage', { name: character.name });
  
  const titleColor = isStandardGlyph ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      titleClassName={titleColor}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
            {t('delete')}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
};

export default React.memo(DeleteConfirmationModal);