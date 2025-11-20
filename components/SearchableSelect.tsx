import React, { useState, useRef, useEffect } from 'react';
import { Character } from '../types';
import { useLocale } from '../contexts/LocaleContext';

interface SearchableSelectProps {
  label: string;
  options: Character[];
  value: Character | null;
  onChange: (value: Character | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, options, value, onChange, placeholder, disabled = false }) => {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value ? value.name : '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // If the dropdown is closed without a selection, revert the text to the current value
        if (value) {
            setSearchTerm(value.name);
        } else {
            setSearchTerm('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [value]);

  const filteredOptions = options.filter(option =>
    !option.hidden && option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: Character) => {
    onChange(option);
    setSearchTerm(option.name);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-40">
      <label htmlFor={`searchable-select-${label}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        id={`searchable-select-${label}`}
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={() => !disabled && setIsOpen(true)}
        placeholder={placeholder || t('searchChar')}
        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
        autoComplete="off"
        disabled={disabled}
      />
      {isOpen && !disabled && (
        <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => (
              <li
                key={option.unicode}
                onClick={() => handleSelect(option)}
                className="p-2 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-700 text-gray-900 dark:text-gray-200"
                style={{
                    fontFamily: 'var(--guide-font-family)',
                    fontFeatureSettings: 'var(--guide-font-feature-settings)'
                }}
              >
                {option.name}
              </li>
            ))
          ) : (
            <li className="p-2 text-gray-500">{t('noResultsFound')}</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default React.memo(SearchableSelect);