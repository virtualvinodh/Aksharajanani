import React from 'react';
import { Character, GlyphData } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import GlyphTile from '../GlyphTile';
import { EditIcon, ClearIcon } from '../../constants';

type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
type ContextualRuleValue = { replace: string[]; left?: string[]; right?: string[] };

interface ExistingRuleDisplayProps {
    ruleKey: string;
    ruleValue: any;
    ruleType: RuleType;
    onEdit: () => void;
    onDelete: () => void;
    allCharsByName: Map<string, Character>;
    glyphDataMap?: Map<number, GlyphData>;
    strokeThickness?: number;
    mode?: 'editing' | 'creating';
}

const GlyphDisplay: React.FC<{ char: Character, glyphData?: GlyphData, strokeThickness: number, mode: 'editing' | 'creating' }> = ({ char, glyphData, strokeThickness, mode }) => {
    if (mode === 'editing') {
        return <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />;
    }
    return <span className="p-2 border rounded bg-gray-100 dark:bg-gray-700 font-semibold">{char.name}</span>;
};

const ExistingRuleDisplay: React.FC<ExistingRuleDisplayProps> = ({ 
    ruleKey, ruleValue, ruleType, onEdit, onDelete, allCharsByName, 
    glyphDataMap, strokeThickness = 15, mode = 'editing' 
}) => {
    const { t } = useLocale();

    const renderRuleContent = () => {
        // Helper component for consistent sizing and styling
        const SizedDisplay: React.FC<{ children: React.ReactNode, isContext?: boolean }> = ({ children, isContext }) => (
            <div className={`flex-shrink-0 w-20 h-20 ${isContext ? 'opacity-60' : ''}`}>
                {children}
            </div>
        );

        const glyphOrGroupDisplay = (name: string, isContext: boolean = false) => {
            if (name.startsWith('@') || name.startsWith('$')) {
                const displayName = name.startsWith('$') ? `@${name.substring(1)}` : name;
                return (
                    <SizedDisplay isContext={isContext}>
                        <div className="w-full h-full flex items-center justify-center p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <span 
                                className="text-sm text-purple-800 dark:text-purple-200 break-all font-mono"
                            >{displayName}</span>
                        </div>
                    </SizedDisplay>
                );
            }
            
            const char = allCharsByName.get(name);
            if (!char) return null;
            
            return (
                <SizedDisplay isContext={isContext}>
                    <GlyphDisplay char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} />
                </SizedDisplay>
            );
        };
        
        if (ruleType === 'single') {
            const inputName = Array.isArray(ruleValue) ? (ruleValue as string[])[0] : null;
            if (!inputName || !ruleKey) return null;
            return (
                <>
                    {glyphOrGroupDisplay(inputName)}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {glyphOrGroupDisplay(ruleKey)}
                </>
            );
        }
        if (ruleType === 'ligature') {
            const ligChar = allCharsByName.get(ruleKey);
            return (
                <>
                    {(ruleValue as string[]).map((compName, index) => (
                        <React.Fragment key={index}>
                            {glyphOrGroupDisplay(compName)}
                            {index < ruleValue.length - 1 && <span className="text-xl font-bold text-gray-400 dark:text-gray-500 mx-1">+</span>}
                        </React.Fragment>
                    ))}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {ligChar && glyphOrGroupDisplay(ligChar.name)}
                </>
            );
        }
        if (ruleType === 'contextual') {
            const contextRule = ruleValue as ContextualRuleValue;
            return (
                <>
                     {(contextRule.left || []).map((name, i) => <React.Fragment key={`l-${i}`}>{glyphOrGroupDisplay(name, true)}</React.Fragment>)}
                     {(contextRule.replace || []).map((name, i) => <React.Fragment key={`t-${i}`}>{glyphOrGroupDisplay(name, false)}</React.Fragment>)}
                     {(contextRule.right || []).map((name, i) => <React.Fragment key={`r-${i}`}>{glyphOrGroupDisplay(name, true)}</React.Fragment>)}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {glyphOrGroupDisplay(ruleKey)}
                </>
            );
        }
        if (ruleType === 'multiple') {
            const inputName = Array.isArray(ruleValue) ? (ruleValue as string[])[0] : null;
            const outputChars = (ruleKey).split(',').map(name => name.trim());
            return (
                <>
                    {inputName && glyphOrGroupDisplay(inputName)}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {outputChars.map((charName, index) => {
                        return <React.Fragment key={index}>{glyphOrGroupDisplay(charName)}</React.Fragment>;
                    })}
                </>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-wrap items-center gap-2 p-2 pr-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            {renderRuleContent()}
            <div className="flex items-center gap-1 ml-auto">
                <button onClick={onEdit} title={t('edit')} className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                    <EditIcon />
                </button>
                <button onClick={onDelete} title={t('deleteRule')} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ClearIcon />
                </button>
            </div>
        </div>
    );
};

export default React.memo(ExistingRuleDisplay);