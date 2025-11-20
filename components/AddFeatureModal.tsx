import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface AddFeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (tag: string) => void;
  existingFeatures: string[];
}

const AddFeatureModal: React.FC<AddFeatureModalProps> = ({ isOpen, onClose, onAdd, existingFeatures }) => {
  const { t } = useLocale();
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTag('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTag = tag.trim();

    if (!/^[a-z0-9]{4}$/.test(trimmedTag)) {
      setError(t('errorFeatureTagInvalid'));
      return;
    }
    if (existingFeatures.includes(trimmedTag)) {
      setError(t('errorFeatureTagExists'));
      return;
    }

    onAdd(trimmedTag);
    onClose();
  };
  
  const formId = "add-feature-form";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('addFeatureModalTitle')}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors">{t('cancel')}</button>
          <button type="submit" form={formId} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">{t('add')}</button>
        </>
      }
    >
        <form id={formId} onSubmit={handleSubmit}>
          <div>
            <label htmlFor="feature-tag-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('featureTagLabel')}</label>
            <input 
              id="feature-tag-input" 
              type="text" 
              value={tag} 
              onChange={e => setTag(e.target.value)} 
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 font-mono" 
              autoFocus 
              maxLength={4}
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
    </Modal>
  );
};

export default React.memo(AddFeatureModal);