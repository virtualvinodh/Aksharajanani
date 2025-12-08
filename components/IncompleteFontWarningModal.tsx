
import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useSettings } from '../contexts/SettingsContext';
import Modal from './Modal';

interface IncompleteFontWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  status: {
    drawing: boolean;
    positioning: boolean;
    kerning: boolean;
  };
  editorMode?: 'simple' | 'advanced';
}

const IncompleteFontWarningModal: React.FC<IncompleteFontWarningModalProps> = ({ isOpen, onClose, onConfirm, status }) => {
  const { t } = useLocale();
  const { settings } = useSettings();

  const incompleteTasks: string[] = [];
  
  const useKerningTerm = settings ? (settings.editorMode === 'advanced' || settings.preferKerningTerm) : false;
  const kerningLabel = useKerningTerm ? t('workspaceKerning') : t('workspaceSpacing');

  if (status.drawing) incompleteTasks.push(t('workspaceDrawing'));
  if (status.positioning) incompleteTasks.push(t('workspacePositioning'));
  if (status.kerning) incompleteTasks.push(kerningLabel);

  const message = t('incompleteFontMessage', { tasks: incompleteTasks.join(', ') });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('incompleteFontTitle')}
      titleClassName="text-yellow-600 dark:text-yellow-400"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
            {t('exportAnyway')}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
};

export default React.memo(IncompleteFontWarningModal);
