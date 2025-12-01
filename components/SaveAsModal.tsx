
import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';
import { SaveIcon } from '../constants';

interface SaveAsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}

const SaveAsModal: React.FC<SaveAsModalProps> = ({ isOpen, onClose, onConfirm, currentName }) => {
  const { t } = useLocale();
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(`Copy of ${currentName}`);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Save Project As"
      size="sm"
      footer={
        <>
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
          >
            {t('cancel')}
          </button>
          <button 
            type="button" 
            onClick={handleSubmit} 
            disabled={!name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <SaveIcon />
            {t('save')}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Project Name
            </label>
            <input 
                id="project-name" 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                onFocus={(e) => e.target.select()}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                This will save a copy of your current project and switch to it. Your original project will remain unchanged.
            </p>
        </div>
      </form>
    </Modal>
  );
};

export default React.memo(SaveAsModal);
