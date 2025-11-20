import React from 'react';
import { useLocale } from '../contexts/LocaleContext';

interface ImageControlPanelProps {
  backgroundImage: string | null;
  backgroundImageOpacity: number;
  setBackgroundImageOpacity: (opacity: number) => void;
  onClearImage: () => void;
}

const ImageControlPanel: React.FC<ImageControlPanelProps> = ({ backgroundImage, backgroundImageOpacity, setBackgroundImageOpacity, onClearImage }) => {
  const { t } = useLocale();

  if (!backgroundImage) {
    return null;
  }
  
  return (
    <div className="absolute top-24 right-4 flex flex-col gap-4 z-10 w-64">
      <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <h4 className="font-bold mb-3 text-gray-900 dark:text-white">{t('imageOptions')}</h4>
          <div className="mb-4">
              <label htmlFor="image-opacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('imageOpacity')}: <span className="font-bold text-indigo-600 dark:text-indigo-400">{(backgroundImageOpacity * 100).toFixed(0)}%</span>
              </label>
              <input
                  id="image-opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={backgroundImageOpacity}
                  onChange={(e) => setBackgroundImageOpacity(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500"
              />
          </div>
          <div className="flex flex-col gap-2">
              <button 
                  onClick={onClearImage} 
                  className="w-full px-4 py-2 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors"
              >
                  {t('clearImage')}
              </button>
          </div>
      </div>
    </div>
  );
};

export default React.memo(ImageControlPanel);