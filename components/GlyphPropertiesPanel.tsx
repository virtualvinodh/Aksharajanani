import React, { useRef, useEffect } from 'react';
import { FontMetrics } from '../types';
import { useLocale } from '../contexts/LocaleContext';

interface GlyphPropertiesPanelProps {
  lsb: number | undefined;
  setLsb: (lsb: number | undefined) => void;
  rsb: number | undefined;
  setRsb: (rsb: number | undefined) => void;
  metrics: FontMetrics;
  onClose: () => void;
}

const GlyphPropertiesPanel: React.FC<GlyphPropertiesPanelProps> = ({ lsb, setLsb, rsb, setRsb, metrics, onClose }) => {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const propertiesButton = document.getElementById('glyph-properties-button');
        if (propertiesButton && !propertiesButton.contains(event.target as Node)) {
          onClose();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);
  
  return (
    <div ref={panelRef} className="absolute top-full right-0 mt-2 w-64 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-gray-900 dark:text-white">{t('glyphProperties')}</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div className="mb-2">
        <label htmlFor="lsb-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('leftSpace')}
        </label>
        <input
          id="lsb-input"
          type="number"
          placeholder={String(metrics.defaultLSB)}
          value={lsb === undefined ? '' : lsb}
          onChange={(e) => setLsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="rsb-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('rightSpace')}
        </label>
        <input
          id="rsb-input"
          type="number"
          placeholder={String(metrics.defaultRSB)}
          value={rsb === undefined ? '' : rsb}
          onChange={(e) => setRsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm"
        />
      </div>
    </div>
  );
};

export default React.memo(GlyphPropertiesPanel);