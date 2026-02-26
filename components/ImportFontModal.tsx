
import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { useLocale } from '../contexts/LocaleContext';
import { parseFontFile, extractProjectData } from '../services/importFontService';
import { ProjectData } from '../types';

interface ImportFontModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (projectData: ProjectData) => void;
}

const ImportFontModal: React.FC<ImportFontModalProps> = ({ isOpen, onClose, onImport }) => {
  const { t } = useLocale();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setStatus(t('parsingFontFile') || 'Parsing font file...');

    try {
      const font = await parseFontFile(file);
      
      const projectData = await extractProjectData(font, file.name, (p, s) => {
        setProgress(p);
        setStatus(s);
      });

      onImport(projectData);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to import font');
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={!isProcessing ? onClose : () => {}}
      title={t('importFont') || 'Import Font'}
      size="md"
    >
      <div className="p-4">
        {!isProcessing ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
               onClick={() => fileInputRef.current?.click()}>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".ttf,.otf,.woff,.woff2" 
            />
            <div className="text-4xl mb-4">📂</div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
              {t('clickToUpload') || 'Click to upload font file'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Supports TTF, OTF, WOFF
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8">
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
              <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{status}</p>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportFontModal;
