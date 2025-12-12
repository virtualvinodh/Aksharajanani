
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CharacterSet } from '../../../types';
import { useLocale } from '../../../contexts/LocaleContext';

interface SmartGlyphInputProps {
    value: string;
    onChange: (value: string) => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    placeholder?: string;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SmartGlyphInput: React.FC<SmartGlyphInputProps> = ({ 
    value, onChange, characterSets, groups, placeholder, className, onKeyDown 
}) => {
    const { t } = useLocale();
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Flatten options for autocomplete
    const options = useMemo(() => {
        const opts: { label: string, value: string, type: 'group' | 'char' | 'set' }[] = [];
        
        // 1. Add Groups ($)
        Object.keys(groups).forEach(g => {
            opts.push({ label: `$${g}`, value: `$${g}`, type: 'group' });
        });

        // 2. Add Character Sets ($) - from characters.json structure
        characterSets.forEach(s => {
            opts.push({ label: `$${t(s.nameKey)} (${s.nameKey})`, value: `$${s.nameKey}`, type: 'set' });
        });

        // 3. Add Individual Characters
        characterSets.flatMap(s => s.characters).forEach(c => {
            opts.push({ label: c.name, value: c.name, type: 'char' });
        });

        return opts;
    }, [groups, characterSets, t]);

    const filteredOptions = useMemo(() => {
        if (!value) return options; // Show all options if no input
        const lower = value.toLowerCase();
        return options.filter(o => o.value.toLowerCase().includes(lower) || o.label.toLowerCase().includes(lower));
    }, [options, value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getTypeColor = (type: string) => {
        switch(type) {
            case 'group': return 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-300';
            case 'set': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300';
            default: return 'text-gray-700 bg-gray-50 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            <input
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                style={{ 
                    fontFamily: 'var(--guide-font-family), monospace',
                    fontFeatureSettings: 'var(--guide-font-feature-settings)'
                }}
            />
            
            {/* Type Indicator Badge inside input */}
            {value && (value.startsWith('$') || value.startsWith('@')) && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <span className="text-[10px] uppercase font-bold text-purple-500 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 rounded">
                        {t('groupLabel')}
                    </span>
                </div>
            )}

            {isOpen && (
                <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredOptions.length > 0 ? filteredOptions.map((opt) => (
                        <li 
                            key={opt.value + opt.type}
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between group"
                        >
                            <span 
                                className="font-medium text-gray-800 dark:text-gray-200" 
                                style={{ 
                                    fontFamily: 'var(--guide-font-family)',
                                    fontFeatureSettings: 'var(--guide-font-feature-settings)'
                                }}
                            >
                                {opt.label}
                            </span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getTypeColor(opt.type)}`}>
                                {opt.type}
                            </span>
                        </li>
                    )) : (
                        <li className="px-3 py-2 text-xs text-gray-400 italic">{t('noMatchesFound')}</li>
                    )}
                </ul>
            )}
        </div>
    );
};

export default React.memo(SmartGlyphInput);
