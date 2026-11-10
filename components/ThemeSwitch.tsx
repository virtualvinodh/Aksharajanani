import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { ThemePreference } from '../types';

const iconProps = { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', 'aria-hidden': true };

const SunIcon = () => (
    <svg {...iconProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
);
const MoonIcon = () => (
    <svg {...iconProps}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const AutoIcon = () => (
    <svg {...iconProps}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);

/** Light / Dark / Auto switch: three icon buttons, the active one highlighted. */
const ThemeSwitch: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { preference, setPreference } = useTheme();
    const { t } = useLocale();
    const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
        { value: 'light', label: t('themeLight'), icon: <SunIcon /> },
        { value: 'dark', label: t('themeDark'), icon: <MoonIcon /> },
        { value: 'auto', label: t('themeAuto'), icon: <AutoIcon /> },
    ];
    return (
        <div role="radiogroup" aria-label={t('theme')} className={`inline-flex items-center p-0.5 rounded-lg ring-1 ring-inset ring-gray-300 dark:ring-gray-600 bg-white dark:bg-gray-800 ${className}`}>
            {options.map(o => {
                const active = preference === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={`${t('theme')}: ${o.label}`}
                        aria-label={o.label}
                        onClick={() => setPreference(o.value)}
                        className={`p-1.5 rounded-md transition-colors ${active ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'}`}
                    >
                        {o.icon}
                    </button>
                );
            })}
        </div>
    );
};

export default React.memo(ThemeSwitch);
