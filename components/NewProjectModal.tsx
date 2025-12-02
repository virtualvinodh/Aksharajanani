
import React, { useState } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import Modal from './Modal';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: NewProjectData) => void;
}

export interface NewProjectData {
    projectName: string;
    fontFamily: string;
    upm: number;
    ascender: number;
    descender: number;
    includeLatin: boolean;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { t } = useLocale();
  
  const [projectName, setProjectName] = useState('My New Font');
  const [fontFamily, setFontFamily] = useState('MyFont');
  const [upm, setUpm] = useState(1000);
  const [ascender, setAscender] = useState(800);
  const [descender, setDescender] = useState(-200);
  const [includeLatin, setIncludeLatin] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onConfirm({
          projectName,
          fontFamily,
          upm,
          ascender,
          descender,
          includeLatin
      });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('newProjectTitle')}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
            {t('cancel')}
          </button>
          <button type="submit" form="new-project-form" className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            {t('startProject')}
          </button>
        </>
      }
    >
      <form id="new-project-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('newProjectName')}
            </label>
            <input 
                id="project-name" 
                type="text" 
                value={projectName} 
                onChange={(e) => setProjectName(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
            />
        </div>
        <div>
            <label htmlFor="font-family" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('fontFamily')}
            </label>
            <input 
                id="font-family" 
                type="text" 
                value={fontFamily} 
                onChange={(e) => setFontFamily(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
            />
        </div>
        
        <div className="grid grid-cols-3 gap-4">
             <div>
                <label htmlFor="upm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('upm')}
                </label>
                <input 
                    id="upm" 
                    type="number" 
                    value={upm} 
                    onChange={(e) => setUpm(parseInt(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
            </div>
            <div>
                <label htmlFor="ascender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('ascender')}
                </label>
                <input 
                    id="ascender" 
                    type="number" 
                    value={ascender} 
                    onChange={(e) => setAscender(parseInt(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
            </div>
            <div>
                <label htmlFor="descender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('descender')}
                </label>
                <input 
                    id="descender" 
                    type="number" 
                    value={descender} 
                    onChange={(e) => setDescender(parseInt(e.target.value))} 
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
            </div>
        </div>

        <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={includeLatin} 
                    onChange={(e) => setIncludeLatin(e.target.checked)} 
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('includeLatinLetters')}</span>
            </label>
        </div>
      </form>
    </Modal>
  );
};

export default NewProjectModal;
