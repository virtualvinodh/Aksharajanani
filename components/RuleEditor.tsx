
import React, { useState, useEffect } from 'react';
import { Character, GlyphData, CharacterSet } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { ClearIcon, AddIcon, TrashIcon } from '../constants';
import GlyphTile from './GlyphTile';
import SmartGlyphInput from './rules/manager/SmartGlyphInput';

type LigatureRule = { ligatureName: string; componentNames: string[] };
type ContextualRuleValue = { replace: string[]; left?: string[]; right?: string[] };
type ContextualRule = { replacementName: string, rule: ContextualRuleValue };
type MultipleRule = { inputName: string[], outputString: string };
type SingleRule = { outputName: string, inputName: string[] };
export type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
type RuleEditorMode = 'editing' | 'creating';

interface RuleEditorProps {
    ruleKey?: string;
    ruleValue?: any;
    ruleType: RuleType;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    glyphDataMap?: Map<number, GlyphData>;
    strokeThickness?: number;
    isNew: boolean;
    onSave: (newRule: LigatureRule | ContextualRule | MultipleRule | SingleRule, ruleType: RuleEditorProps['ruleType']) => void;
    onCancel?: () => void;
    showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
    mode?: RuleEditorMode;
    groups?: Record<string, string[]>;
    glyphVersion?: number;
}

interface GlyphSlotProps {
    onClick: () => void;
    char: Character | null;
    glyphData: GlyphData | undefined;
    strokeThickness: number;
    prompt: string;
    onClear?: () => void;
    isGroup?: boolean;
    groupName?: string;
}

const GlyphSlot: React.FC<GlyphSlotProps> = React.memo(({ onClick, char, glyphData, strokeThickness, prompt, onClear, isGroup, groupName }) => {
    return (
        <div className="relative group/slot">
            <div 
                onClick={onClick}
                className={`w-20 h-20 border-2 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${
                    isGroup 
                        ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800' 
                        : (char ? 'border-gray-300 dark:border-gray-600 border-dashed' : 'border-gray-400 dark:border-gray-500 border-dashed')
                }`}
            >
                {isGroup ? (
                    <span className="font-mono text-sm text-purple-800 dark:text-purple-200 break-all text-center p-1">{groupName}</span>
                ) : (
                    char && glyphData ? (
                        <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />
                    ) : (
                        <span className="text-xs text-gray-500 text-center p-1">{prompt}</span>
                    )
                )}
            </div>
            {onClear && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onClear(); }} 
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 z-10 opacity-0 group-hover/slot:opacity-100 transition-opacity shadow-sm"
                    type="button"
                 >
                    <ClearIcon />
                </button>
            )}
        </div>
    );
});

const RuleEditor: React.FC<RuleEditorProps> = ({ 
    ruleKey, ruleValue, ruleType, allCharacterSets, allCharsByName, 
    glyphDataMap, strokeThickness = 15, isNew, onSave, onCancel, showNotification, mode = 'editing',
    groups = {}, glyphVersion
}) => {
    const { t } = useLocale();
    
    // State for Ligature Editor
    const [components, setComponents] = useState<string[]>([]);
    const [ligature, setLigature] = useState<string | null>(null);

    // State for Contextual Editor
    const [leftContext, setLeftContext] = useState<string[]>([]);
    const [target, setTarget] = useState<string[]>([]);
    const [rightContext, setRightContext] = useState<string[]>([]);
    const [replacement, setReplacement] = useState<string | null>(null);
    
    // State for Multiple Substitution Editor
    const [multiInputGlyph, setMultiInputGlyph] = useState<string | null>(null);
    const [outputSequence, setOutputSequence] = useState<string[]>([]);

    // State for Single Substitution Editor
    const [singleInput, setSingleInput] = useState<string | null>(null);
    const [singleOutput, setSingleOutput] = useState<string | null>(null);

    // Editing State
    const [editingSlot, setEditingSlot] = useState<{ type: string, index?: number } | null>(null);
    const [addValue, setAddValue] = useState('');

    useEffect(() => {
        setAddValue('');
    }, [editingSlot]);

    useEffect(() => {
        if (!isNew) {
            if (ruleType === 'ligature') {
                setComponents(ruleValue || []);
                setLigature(ruleKey || null);
            } else if (ruleType === 'contextual') {
                setLeftContext(ruleValue?.left || []);
                setTarget(Array.isArray(ruleValue?.replace) ? ruleValue.replace : []);
                setRightContext(ruleValue?.right || []);
                setReplacement(ruleKey || null);
            } else if (ruleType === 'multiple') {
                setMultiInputGlyph(Array.isArray(ruleValue) ? ruleValue[0] : null);
                setOutputSequence((ruleKey || '').split(',').map(s => s.trim()).filter(Boolean));
            } else if (ruleType === 'single') {
                setSingleInput(Array.isArray(ruleValue) ? ruleValue[0] : null);
                setSingleOutput(ruleKey || null);
            }
        } else {
            setComponents([]); setLigature(null);
            setLeftContext([]); setTarget([]); setRightContext([]); setReplacement(null);
            setMultiInputGlyph(null); setOutputSequence([]);
            setSingleInput(null); setSingleOutput(null);
        }
    }, [isNew, ruleKey, ruleValue, ruleType]);

    const handleUpdate = (type: string, value: string, index?: number) => {
        const updateArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string, idx?: number) => {
            setter(prev => {
                if (idx !== undefined && idx < prev.length) {
                    return prev.map((item, i) => i === idx ? val : item);
                }
                return [...prev, val];
            });
        };

        switch (type) {
            case 'ligature': setLigature(value); break;
            case 'component': updateArray(setComponents, value, index); break;
            
            case 'left': updateArray(setLeftContext, value, index); break;
            case 'target': updateArray(setTarget, value, index); break;
            case 'right': updateArray(setRightContext, value, index); break;
            case 'replacement': setReplacement(value); break;

            case 'multi-input': setMultiInputGlyph(value); break;
            case 'multi-output': updateArray(setOutputSequence, value, index); break;

            case 'single-input': setSingleInput(value); break;
            case 'single-output': setSingleOutput(value); break;
        }
    };

    const handleRemove = (type: string, index?: number) => {
        const removeFromArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) => {
            setter(prev => prev.filter((_, i) => i !== idx));
        };

        switch(type) {
            case 'component': if(index !== undefined) removeFromArray(setComponents, index); break;
            case 'left': if(index !== undefined) removeFromArray(setLeftContext, index); break;
            case 'target': if(index !== undefined) removeFromArray(setTarget, index); break;
            case 'right': if(index !== undefined) removeFromArray(setRightContext, index); break;
            case 'multi-output': if(index !== undefined) removeFromArray(setOutputSequence, index); break;
            
            case 'ligature': setLigature(null); break;
            case 'replacement': setReplacement(null); break;
            case 'multi-input': setMultiInputGlyph(null); break;
            case 'single-input': setSingleInput(null); break;
            case 'single-output': setSingleOutput(null); break;
        }
        setEditingSlot(null);
    };

    const renderSlot = (type: string, value: string | null, index?: number, placeholder: string = "Select") => {
        const isEditing = editingSlot?.type === type && editingSlot?.index === index;

        if (isEditing) {
            return (
                <div className="w-32 h-20 flex items-center">
                    <SmartGlyphInput
                        value={value || ''}
                        onChange={(val) => handleUpdate(type, val, index)}
                        onSelect={(val) => { handleUpdate(type, val, index); setEditingSlot(null); }}
                        onBlur={() => setEditingSlot(null)}
                        autoFocus
                        characterSets={allCharacterSets}
                        groups={groups}
                        placeholder={placeholder}
                        className="w-full"
                    />
                </div>
            );
        }

        const isGroup = value ? (value.startsWith('@') || value.startsWith('$')) : false;
        const char = (value && !isGroup) ? allCharsByName.get(value) : null;
        const glyphData = char ? glyphDataMap?.get(char.unicode) : undefined;

        return (
            <GlyphSlot
                onClick={() => setEditingSlot({ type, index })}
                char={char}
                glyphData={glyphData}
                strokeThickness={strokeThickness}
                prompt={value || placeholder}
                onClear={value ? () => handleRemove(type, index) : undefined}
                isGroup={isGroup}
                groupName={value || ''}
            />
        );
    };

    // Helper for rendering Add buttons that behave like slots
    const renderAddSlot = (type: string, index: number, placeholder: string = "Add") => {
         const isEditing = editingSlot?.type === type && editingSlot?.index === index;
         if (isEditing) {
             return (
                <div className="w-32 h-20 flex items-center">
                    <SmartGlyphInput
                        value={addValue}
                        onChange={(val) => setAddValue(val)}
                        onSelect={(val) => { handleUpdate(type, val, index); setAddValue(''); setEditingSlot(null); }}
                        onBlur={() => { setAddValue(''); setEditingSlot(null); }}
                        onKeyDown={(e) => {
                             if (e.key === 'Enter' && addValue) {
                                 handleUpdate(type, addValue, index);
                                 setAddValue('');
                                 // Don't close slot to allow rapid entry
                             }
                             if (e.key === 'Escape') setEditingSlot(null);
                        }}
                        autoFocus
                        characterSets={allCharacterSets}
                        groups={groups}
                        placeholder={placeholder}
                    />
                </div>
             );
         }
         return (
             <button 
                onClick={() => setEditingSlot({ type, index })}
                className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
             >
                 <AddIcon className="w-6 h-6" />
             </button>
         );
    };

    const handleSave = () => {
        if (ruleType === 'ligature') {
            if (ligature && components.length > 0) {
                onSave({ ligatureName: ligature, componentNames: components }, 'ligature');
                if (isNew) { setComponents([]); setLigature(null); }
            } else {
                showNotification(t('errorLigatureRule'), 'error');
            }
        } else if (ruleType === 'contextual') {
            if (target.length > 0 && replacement && (leftContext.length > 0 || rightContext.length > 0)) {
                const rule: ContextualRuleValue = { replace: target };
                if (leftContext.length > 0) rule.left = leftContext;
                if (rightContext.length > 0) rule.right = rightContext;
                onSave({ replacementName: replacement, rule }, 'contextual');
                 if (isNew) { setLeftContext([]); setTarget([]); setRightContext([]); setReplacement(null); }
            } else {
                showNotification(t('errorContextualRule'), 'error');
            }
        } else if (ruleType === 'multiple') {
             if (multiInputGlyph && outputSequence.length > 0) {
                onSave({ inputName: [multiInputGlyph], outputString: outputSequence.join(',') }, 'multiple');
                if (isNew) { setMultiInputGlyph(null); setOutputSequence([]); }
             } else {
                showNotification(t('errorMultipleRule'), 'error');
             }
        } else if (ruleType === 'single') {
            if (singleInput && singleOutput) {
                onSave({ outputName: singleOutput, inputName: [singleInput] }, 'single');
                if (isNew) { setSingleInput(null); setSingleOutput(null); }
            } else {
                showNotification(t('errorSingleRule'), 'error');
            }
        }
    };

    const content = () => {
        if (ruleType === 'ligature') {
            return (
                 <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="w-full md:w-auto">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase">{t('inputComponents')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] items-center">
                            {components.map((name, index) => renderSlot('component', name, index))}
                            {renderAddSlot('component', components.length)}
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-400 dark:text-gray-600 transform md:rotate-0 rotate-90">→</div>
                    <div>
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase">{t('outputLigature')}</h4>
                        {renderSlot('ligature', ligature)}
                    </div>
                </div>
            );
        }
        if (ruleType === 'contextual') {
            return (
                <div className="flex flex-col md:flex-row items-start gap-4 justify-center">
                    <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-xs uppercase">{t('leftContext')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] justify-center">
                            {leftContext.map((name, index) => renderSlot('left', name, index))}
                            {renderAddSlot('left', leftContext.length)}
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-xs uppercase">{t('targetGlyph')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-md min-h-[100px] justify-center">
                            {target.map((name, index) => renderSlot('target', name, index))}
                            {renderAddSlot('target', target.length)}
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-xs uppercase">{t('rightContext')}</h4>
                         <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] justify-center">
                            {rightContext.map((name, index) => renderSlot('right', name, index))}
                            {renderAddSlot('right', rightContext.length)}
                        </div>
                    </div>
                    <div className="self-center pt-8 text-2xl font-bold text-gray-400 dark:text-gray-600">→</div>
                    <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-xs uppercase">{t('replacementGlyph')}</h4>
                        {renderSlot('replacement', replacement)}
                    </div>
                </div>
            );
        }
        if (ruleType === 'multiple') {
            return (
                 <div className="flex flex-col md:flex-row items-center gap-4">
                    <div>
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase">{t('inputGlyph')}</h4>
                        {renderSlot('multi-input', multiInputGlyph)}
                    </div>
                    <div className="text-2xl font-bold text-gray-400 dark:text-gray-600 transform md:rotate-0 rotate-90">→</div>
                    <div className="w-full md:w-auto">
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase">{t('outputSequence')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] items-center">
                            {outputSequence.map((name, index) => renderSlot('multi-output', name, index))}
                            {renderAddSlot('multi-output', outputSequence.length)}
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'single') {
            return (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                    <div>
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase text-center">{t('inputGlyph')}</h4>
                        {renderSlot('single-input', singleInput)}
                    </div>
                    <div className="text-2xl font-bold text-gray-400 dark:text-gray-600 transform sm:rotate-0 rotate-90 mt-6">→</div>
                    <div>
                        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-sm uppercase text-center">{t('outputGlyph')}</h4>
                        {renderSlot('single-output', singleOutput)}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            {content()}
            <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                {onCancel && <button onClick={onCancel} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>}
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                    {isNew ? t('saveRule') : t('updateRule')}
                </button>
            </div>
        </div>
    );
};

export default React.memo(RuleEditor);
