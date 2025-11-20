import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { LanguageIcon } from '../constants';
import { Locale } from '../types';

const LanguageSelector: React.FC = () => {
  const { locale, setLocale, availableLocales, t } = useLocale();

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Cast the value back to the Locale type.
    // This is safe because the options are generated from availableLocales.
    setLocale(e.target.value as Locale);
  };

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none z-10 text-gray-800 dark:text-white">
        <LanguageIcon />
      </div>
      <select
        value={locale}
        onChange={handleLocaleChange}
        title={t('changeLanguage')}
        aria-label={t('changeLanguage')}
        className="w-full pl-10 pr-8 py-2 text-sm font-semibold text-gray-800 dark:text-white bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer group-hover:bg-gray-300 dark:group-hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors"
      >
        {availableLocales.map(loc => (
          <option key={loc.code} value={loc.code} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold">
            {loc.nativeName}
          </option>
        ))}
      </select>
       <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
        <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
};

export default React.memo(LanguageSelector);