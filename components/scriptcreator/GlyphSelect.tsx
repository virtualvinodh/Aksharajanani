import React, { useMemo } from 'react';
import { CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface GlyphSelectProps {
    characterSets: CharacterSet[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    className?: string;
    groups?: Record<string, string[]>;
}

const GlyphSelect: React.FC<GlyphSelectProps> = ({ characterSets, value, onChange, label, className, groups }) => {
    const { t } = useLocale();
    const allChars = useMemo(() => {
        return characterSets.flatMap(cs => cs.characters).sort((a, b) => a.name.localeCompare(b.name));
    }, [characterSets]);

    const fontStyle = {
        fontFamily: 'var(--guide-font-family)',
        fontFeatureSettings: 'var(--guide-font-feature-settings)'
    };

    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={label}
            className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${className}`}
            style={fontStyle}
        >
            <option value="" style={fontStyle}>{label}</option>
            {groups && Object.keys(groups).length > 0 && (
                <optgroup label={t('glyphGroups')}>
                    {Object.keys(groups).map(groupName => (
                        <option key={`group-${groupName}`} value={`$${groupName}`} style={fontStyle}>
                            @{groupName}
                        </option>
                    ))}
                </optgroup>
            )}
            <optgroup label={t('characters')}>
                {allChars.map(char => (
                    <option key={char.unicode || char.name} value={char.name} style={fontStyle}>
                        {char.name}
                    </option>
                ))}
            </optgroup>
        </select>
    );
};

export default GlyphSelect;