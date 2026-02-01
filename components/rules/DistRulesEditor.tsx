
import React, { useState, useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import GlyphTile from '../GlyphTile';
import { ClearIcon, EditIcon, TrashIcon, AddIcon } from '../../constants';
import { Character, GlyphData, CharacterSet } from '../../types';
import SmartGlyphInput from './manager/SmartGlyphInput';

interface DistContextualRuleValue {
    target: string;
    space: string;
    left?: string[];
    right?: string[];
}

interface DistRulesEditorProps {
    rules: { 
        simple?: { [key: string]: string };
        contextual?: DistContextualRuleValue[];
    };
    onSave: (rule: any, type: 'simple' | 'contextual') => void;
    onDelete: (keyOrIndex: string | number, type: 'simple' | 'contextual') => void;
    onEditRule: (ruleData: any, type: 'simple' | 'contextual') => void;
    addingRuleType: 'simple' | 'contextual' | null;
    onAddRule: (type: 'simple' | 'contextual' | null) => void;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
    groups: Record<string, string[]>;
    glyphVersion: number;
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
                    char ? (
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


const DistRulesEditor: React.FC<DistRulesEditorProps> = ({ 
    rules, onSave, onDelete, onEditRule, addingRuleType, onAddRule, allCharacterSets,
    allCharsByName, glyphDataMap, strokeThickness, showNotification, groups, glyphVersion
}) => {
    const { t } = useLocale();
    const [editorState, setEditorState] = useState<{ type: 'simple' | 'contextual', target: string | null, value: string, left: string[], right: string[] }>({
        type: 'simple', target: null, value: '0', left: [], right: []
    });
    
    const [editingContextualRuleIndex, setEditingContextualRuleIndex] = useState<number | null>(null);
    const [editingSimpleRuleKey, setEditingSimpleRuleKey] = useState<string | null>(null);
    
    // Editing State
    const [editingSlot, setEditingSlot] = useState<{ type: string, index?: number } | null>(null);
    const [addValue, setAddValue] = useState('');

    const simpleRules = Object.entries(rules.simple || {});
    const contextualRules = rules.contextual || [];

    const isEditing = editingContextualRuleIndex !== null || editingSimpleRuleKey !== null;
    const isAdding = addingRuleType !== null;

    useEffect(() => {
        setAddValue('');
    }, [editingSlot]);

    useEffect(() => {
        if (editingContextualRuleIndex !== null) {
            const rule = contextualRules[editingContextualRuleIndex];
            if (rule) {
                setEditorState({
                    type: 'contextual',
                    target: rule.target,
                    value: rule.space,
                    left: rule.left || [],
                    right: rule.right || []
                });
            }
        } else if (editingSimpleRuleKey !== null) {
            const value = rules.simple?.[editingSimpleRuleKey];
            if (value !== undefined) {
                setEditorState({
                    type: 'simple',
                    target: editingSimpleRuleKey,
                    value: value,
                    left: [],
                    right: []
                });
            }
        }
    }, [editingContextualRuleIndex, editingSimpleRuleKey, contextualRules, rules.simple]);
    
    useEffect(() => {
        if (isAdding) {
            setEditorState({ type: addingRuleType!, target: null, value: '0', left: [], right: [] });
        }
    }, [isAdding, addingRuleType]);

    const handleUpdate = (type: string, value: string, index?: number) => {
        const updateArray = (field: 'left' | 'right', val: string, idx?: number) => {
            setEditorState(s => {
                const newArr = [...s[field]];
                if (idx !== undefined && idx < newArr.length) {
                    newArr[idx] = val;
                } else {
                    newArr.push(val);
                }
                return { ...s, [field]: newArr };
            });
        };

        switch (type) {
            case 'target': setEditorState(s => ({ ...s, target: value })); break;
            case 'left': updateArray('left', value, index); break;
            case 'right': updateArray('right', value, index); break;
        }
    };

    const handleRemove = (type: string, index?: number) => {
        if (type === 'target') {
            setEditorState(s => ({ ...s, target: null }));
        } else if ((type === 'left' || type === 'right') && index !== undefined) {
             setEditorState(s => ({ 
                 ...s, 
                 [type]: s[type].filter((_, i) => i !== index) 
             }));
        }
        setEditingSlot(null);
    };

    const renderSlot = (type: string, value: string | null, index?: number, placeholder: string = "Select") => {
        const isEditingSlot = editingSlot?.type === type && editingSlot?.index === index;

        if (isEditingSlot) {
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
                    />
                </div>
            );
        }

        const isGroup = value ? (value.startsWith('@') || value.startsWith('$')) : false;
        const char = (value && !isGroup) ? allCharsByName.get(value) : null;
        const glyphData = char ? glyphDataMap.get(char.unicode) : undefined;

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

    const renderAddSlot = (type: string, index: number, placeholder: string = "Add") => {
         const isEditingSlot = editingSlot?.type === type && editingSlot?.index === index;
         if (isEditingSlot) {
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
        const { type, target, value, left, right } = editorState;
        if (!type) return;

        if (type === 'simple') {
            if (!target) {
                showNotification(t('errorDistSimpleRule'), 'error');
                return;
            }
            if (isEditing) {
                onEditRule({ oldKey: editingSimpleRuleKey, newKey: target, value }, 'simple');
            } else {
                onSave({ key: target, value }, 'simple');
            }
        } else { // contextual
            const cleanLeft = left.filter(Boolean);
            const cleanRight = right.filter(Boolean);
            if (!target || (cleanLeft.length === 0 && cleanRight.length === 0)) {
                showNotification(t('errorDistContextualRule'), 'error');
                return;
            }
            const ruleValue: DistContextualRuleValue = {
                target,
                space: value,
            };
            if (cleanLeft.length > 0) ruleValue.left = cleanLeft;
            if (cleanRight.length > 0) ruleValue.right = cleanRight;
            
            if (isEditing) {
                onEditRule({ index: editingContextualRuleIndex, rule: ruleValue }, 'contextual');
            } else {
                onSave(ruleValue, 'contextual');
            }
        }
        setEditingContextualRuleIndex(null);
        setEditingSimpleRuleKey(null);
        onAddRule(null);
    };
    
    const handleCancel = () => {
        setEditingContextualRuleIndex(null);
        setEditingSimpleRuleKey(null);
        onAddRule(null);
    };

    const renderEditor = () => (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 space-y-4">
            {(isEditing ? editorState.type : addingRuleType) === 'simple' ? (
                 <div className="flex items-center gap-4 justify-center">
                    {renderSlot('target', editorState.target, undefined, t('targetCharacter'))}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleValue')}</label>
                        <input type="number" value={editorState.value} onChange={e => setEditorState(s => ({...s, value: e.target.value}))} className="w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2" />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row items-start justify-center gap-4">
                     <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('leftContext')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] justify-center">
                            {editorState.left.map((name, index) => renderSlot('left', name, index))}
                            {renderAddSlot('left', editorState.left.length)}
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('targetCharacter')}</h4>
                        <div className="flex flex-col gap-4 items-center">
                            {renderSlot('target', editorState.target, undefined, t('targetGlyph'))}
                            <div className="w-full">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 text-center">{t('space')}</label>
                                <input type="number" value={editorState.value} onChange={e => setEditorState(s => ({...s, value: e.target.value}))} className="w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-center" />
                            </div>
                        </div>
                    </div>
                     <div className="flex flex-col items-center">
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('rightContext')}</h4>
                        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[100px] justify-center">
                            {editorState.right.map((name, index) => renderSlot('right', name, index))}
                            {renderAddSlot('right', editorState.right.length)}
                        </div>
                    </div>
                </div>
            )}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button onClick={handleCancel} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">{isEditing ? t('updateRule') : t('saveRule')}</button>
            </div>
        </div>
    );
    
    return (
        <div className="space-y-6">
             {!(isAdding || isEditing) && (
                 <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                        <span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span>
                        <button onClick={() => onAddRule('simple')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSimpleDistRule')}</button>
                        <button onClick={() => onAddRule('contextual')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualDistRule')}</button>
                    </div>
                </div>
            )}

            {(isAdding || isEditing) && renderEditor()}
            
            {simpleRules.length > 0 && <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">{t('simplePositioning')}</h3>}
            {simpleRules.map(([key, value]) => {
                const isGroup = key.startsWith('@') || key.startsWith('$');
                return (
                    <div key={key} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 group">
                        {isGroup ? (
                            <div className="w-20 h-20 bg-purple-100 dark:bg-purple-900/50 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center justify-center">
                                <span className="font-mono text-sm text-purple-800 dark:text-purple-200 font-bold">{key}</span>
                            </div>
                        ) : (
                            <GlyphTile character={allCharsByName.get(key)!} glyphData={glyphDataMap.get(allCharsByName.get(key)?.unicode || 0)} strokeThickness={strokeThickness} />
                        )}
                        <span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span>
                        <span className="font-mono text-lg font-semibold p-2 bg-gray-100 dark:bg-gray-700 rounded-md">{value as string}</span>
                        <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingSimpleRuleKey(key)} title={t('edit')} className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                                <EditIcon />
                            </button>
                            <button onClick={() => onDelete(key, 'simple')} title={t('deleteRule')} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                                <ClearIcon />
                            </button>
                        </div>
                    </div>
                );
            })}

            {contextualRules.length > 0 && <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">{t('contextualPositioning')}</h3>}
            {contextualRules.map((rule, index) => {
                const isTargetGroup = rule.target.startsWith('@') || rule.target.startsWith('$');
                return (
                    <div key={index} className="p-3 border bg-white dark:bg-gray-800 rounded-lg flex justify-between items-center dark:border-gray-700 group shadow-sm">
                        <div className="flex items-center gap-1 flex-wrap">
                            {(rule.left || []).map((name: string, i: number) => (name.startsWith('@') || name.startsWith('$')) ? <span key={`l-${i}`} className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-2 py-1 rounded font-mono font-bold">{name}</span> : <div key={`l-${i}`} className="opacity-60 scale-75"><GlyphTile character={allCharsByName.get(name)!} glyphData={glyphDataMap.get(allCharsByName.get(name)?.unicode || 0)} strokeThickness={strokeThickness} /></div>)}
                            
                            {isTargetGroup ? (
                                <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-2 py-1 rounded font-mono font-bold">{rule.target}</span>
                            ) : (
                                <GlyphTile character={allCharsByName.get(rule.target)!} glyphData={glyphDataMap.get(allCharsByName.get(rule.target)?.unicode || 0)} strokeThickness={strokeThickness} />
                            )}
                            
                            {(rule.right || []).map((name: string, i: number) => (name.startsWith('@') || name.startsWith('$')) ? <span key={`r-${i}`} className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-2 py-1 rounded font-mono font-bold">{name}</span> : <div key={`r-${i}`} className="opacity-60 scale-75"><GlyphTile character={allCharsByName.get(name)!} glyphData={glyphDataMap.get(allCharsByName.get(name)?.unicode || 0)} strokeThickness={strokeThickness} /></div>)}
                            <span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span>
                            <span className="font-mono p-1.5 bg-gray-100 dark:bg-gray-700 rounded font-bold text-sm">{rule.space}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingContextualRuleIndex(index)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full hover:text-indigo-600"><EditIcon/></button>
                            <button onClick={() => onDelete(index, 'contextual')} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full hover:text-red-600"><TrashIcon/></button>
                        </div>
                    </div>
                );
            })}
        </div>
    )
};

export default DistRulesEditor;
