
import React, { useState, useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import GlyphTile from '../GlyphTile';
import { ClearIcon, EditIcon, AddIcon, TrashIcon } from '../../constants';
import { Character, GlyphData, CharacterSet } from '../../types';
import GlyphSelectionModal from '../GlyphSelectionModal';
import GlyphSelect from '../scriptcreator/GlyphSelect';

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
}
const GlyphSlot: React.FC<GlyphSlotProps> = React.memo(({ onClick, char, glyphData, strokeThickness, prompt, onClear }) => {
    return (
        <div className="relative">
            <div 
                onClick={onClick}
                className={`w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${char ? 'border-gray-300 dark:border-gray-600' : 'border-gray-400 dark:border-gray-500'}`}
            >
                {char ? (
                    <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />
                ) : (
                    <span className="text-xs text-gray-500 text-center p-1">{prompt}</span>
                )}
            </div>
            {char && onClear && (
                 <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                    <ClearIcon />
                </button>
            )}
        </div>
    );
});

const GroupSlot: React.FC<{ 
    value: string; 
    groups: Record<string, string[]>; 
    characterSets: CharacterSet[];
    onChange: (newValue: string) => void; 
    onRemove: () => void; 
}> = ({ value, groups, characterSets, onChange, onRemove }) => {
    const { t } = useLocale();
    const groupNames = Object.keys(groups);
    const prefix = value.charAt(0); // '$' or '@'

    return (
        <div className="relative group z-10">
            <div className="w-20 h-20 border-2 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-900/50 cursor-pointer border-purple-200 dark:border-purple-800 group-hover:border-purple-400">
                <span className="font-mono text-sm text-purple-800 dark:text-purple-200">{value}</span>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }} 
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 z-20"
                type="button"
            >
                <ClearIcon />
            </button>
            
            <div className="absolute hidden group-hover:block top-full pt-1 left-1/2 -translate-x-1/2 z-30">
                <div className="bg-white dark:bg-gray-700 rounded-md shadow-xl border dark:border-gray-600 p-1 min-w-[140px] max-h-48 overflow-y-auto">
                    {characterSets.length > 0 && (
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-400 border-b dark:border-gray-600">Sets</div>
                    )}
                    {characterSets.map(set => (
                        <button
                            key={`set-${set.nameKey}`}
                            type="button"
                            onClick={() => onChange(`$${set.nameKey}`)}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-purple-50 dark:hover:bg-gray-600 font-mono block ${value === `$${set.nameKey}` ? 'bg-purple-100 dark:bg-gray-600 font-bold' : ''}`}
                        >
                            ${t(set.nameKey)}
                        </button>
                    ))}
                    {groupNames.length > 0 && (
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-t mt-1 dark:border-gray-600">Groups</div>
                    )}
                    {groupNames.map(name => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => onChange(`@${name}`)}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-purple-50 dark:hover:bg-gray-600 font-mono block ${value === `@${name}` ? 'bg-purple-100 dark:bg-gray-600 font-bold' : ''}`}
                        >
                            @{name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const GroupSelector: React.FC<{ 
    groups: Record<string, string[]>, 
    characterSets: CharacterSet[],
    onSelect: (groupName: string) => void 
}> = ({ groups, characterSets, onSelect }) => {
    const { t } = useLocale();
    const groupNames = Object.keys(groups);

    return (
        <div className="relative group">
            <button type="button" className="w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors text-xs text-gray-500 hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border-gray-400 dark:border-gray-500">
                {t('addGroup')}
            </button>
            <div className="absolute hidden group-hover:block z-20 bottom-full pb-2 left-1/2 -translate-x-1/2">
                <div className="bg-white dark:bg-gray-700 rounded-md shadow-lg border dark:border-gray-600 p-1 min-w-[140px] max-h-48 overflow-y-auto">
                    {characterSets.length > 0 && (
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-400 border-b dark:border-gray-600">Sets</div>
                    )}
                    {characterSets.map(set => (
                        <button
                            key={`set-${set.nameKey}`}
                            type="button"
                            onClick={() => onSelect(`$${set.nameKey}`)}
                            className="w-full text-left px-3 py-1 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 font-mono"
                        >
                            ${t(set.nameKey)}
                        </button>
                    ))}
                    {groupNames.length > 0 && (
                        <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-t mt-1 dark:border-gray-600">Groups</div>
                    )}
                    {groupNames.map(name => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => onSelect(`@${name}`)}
                            className="w-full text-left px-3 py-1 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 font-mono"
                        >
                            @{name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};


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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState<{ type: string; index?: number } | null>(null);

    const simpleRules = Object.entries(rules.simple || {});
    const contextualRules = rules.contextual || [];

    const isEditing = editingContextualRuleIndex !== null || editingSimpleRuleKey !== null;
    const isAdding = addingRuleType !== null;

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
    
    const openGlyphModal = (type: string, index?: number) => {
        setModalTarget({ type, index });
        setIsModalOpen(true);
    };

    const handleGlyphSelect = (char: Character) => {
        if (!modalTarget) return;
        const { type, index } = modalTarget;
        
        const updateArray = (field: 'left' | 'right', value: string, idx?: number) => {
            setEditorState(s => {
                const newArr = [...s[field]];
                if (idx !== undefined) {
                    newArr[idx] = value;
                }
                return { ...s, [field]: newArr };
            });
        };

        switch (type) {
            case 'target': setEditorState(s => ({ ...s, target: char.name })); break;
            case 'left-add': setEditorState(s => ({ ...s, left: [...s.left, char.name] })); break;
            case 'left-replace': updateArray('left', char.name, index); break;
            case 'right-add': setEditorState(s => ({ ...s, right: [...s.right, char.name] })); break;
            case 'right-replace': updateArray('right', char.name, index); break;
        }

        setIsModalOpen(false);
        setModalTarget(null);
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
                 <div className="flex items-end gap-4 justify-center">
                    <GlyphSlot onClick={() => openGlyphModal('target')} onClear={() => setEditorState(s => ({...s, target: null}))} char={editorState.target ? allCharsByName.get(editorState.target) : null} glyphData={editorState.target ? glyphDataMap.get(allCharsByName.get(editorState.target)!.unicode) : undefined} strokeThickness={strokeThickness} prompt={t('targetCharacter')} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleValue')}</label>
                        <input type="number" value={editorState.value} onChange={e => setEditorState(s => ({...s, value: e.target.value}))} className="w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2" />
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-start justify-center gap-2">
                     <div>
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('leftContext')}</h4>
                        <div className="flex flex-col items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                            {editorState.left.map((name, index) => (name.startsWith('@') || name.startsWith('$')) ? 
                                <GroupSlot
                                    key={index}
                                    value={name}
                                    groups={groups}
                                    characterSets={allCharacterSets}
                                    onChange={(val) => setEditorState(s => ({...s, left: s.left.map((item, idx) => idx === index ? val : item)}))}
                                    onRemove={() => setEditorState(s => ({...s, left: s.left.filter((_, i) => i !== index)}))}
                                /> :
                                <GlyphSlot key={index} onClick={() => openGlyphModal('left-replace', index)} onClear={() => setEditorState(s => ({...s, left: s.left.filter((_, i) => i !== index)}))} char={allCharsByName.get(name) || null} glyphData={allCharsByName.get(name) ? glyphDataMap.get(allCharsByName.get(name)!.unicode) : undefined} strokeThickness={strokeThickness} prompt={t('add')} />)}
                            <GlyphSlot onClick={() => openGlyphModal('left-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                            <GroupSelector groups={groups} characterSets={allCharacterSets} onSelect={name => setEditorState(s => ({...s, left: [...s.left, name]}))} />
                        </div>
                    </div>
                    <div className="pt-5 text-center">
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('targetCharacter')}</h4>
                        <GlyphSlot onClick={() => openGlyphModal('target')} onClear={() => setEditorState(s => ({...s, target: null}))} char={editorState.target ? allCharsByName.get(editorState.target) : null} glyphData={editorState.target ? glyphDataMap.get(allCharsByName.get(editorState.target)!.unicode) : undefined} strokeThickness={strokeThickness} prompt={t('targetGlyph')} />
                    </div>
                     <div>
                        <h4 className="font-semibold mb-2 text-xs text-center text-gray-700 dark:text-gray-300">{t('rightContext')}</h4>
                        <div className="flex flex-col items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                            {editorState.right.map((name, index) => (name.startsWith('@') || name.startsWith('$')) ?
                                <GroupSlot
                                    key={index}
                                    value={name}
                                    groups={groups}
                                    characterSets={allCharacterSets}
                                    onChange={(val) => setEditorState(s => ({...s, right: s.right.map((item, idx) => idx === index ? val : item)}))}
                                    onRemove={() => setEditorState(s => ({...s, right: s.right.filter((_, i) => i !== index)}))}
                                /> :
                                <GlyphSlot key={index} onClick={() => openGlyphModal('right-replace', index)} onClear={() => setEditorState(s => ({...s, right: s.right.filter((_, i) => i !== index)}))} char={allCharsByName.get(name) || null} glyphData={allCharsByName.get(name) ? glyphDataMap.get(allCharsByName.get(name)!.unicode) : undefined} strokeThickness={strokeThickness} prompt={t('add')} />)}
                            <GlyphSlot onClick={() => openGlyphModal('right-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                            <GroupSelector groups={groups} characterSets={allCharacterSets} onSelect={name => setEditorState(s => ({...s, right: [...s.right, name]}))} />
                        </div>
                    </div>
                    <div className="pt-5">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('space')}</label>
                        <input type="number" value={editorState.value} onChange={e => setEditorState(s => ({...s, value: e.target.value}))} className="w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2" />
                    </div>
                </div>
            )}
            <div className="flex justify-end gap-2 mt-2">
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
            {simpleRules.map(([key, value]) => (
                <div key={key} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    <GlyphTile character={allCharsByName.get(key)!} glyphData={glyphDataMap.get(allCharsByName.get(key)!.unicode)} strokeThickness={strokeThickness} />
                    <span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span>
                    <span className="font-mono text-lg font-semibold p-2 bg-gray-100 dark:bg-gray-700 rounded-md">{value as string}</span>
                     <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => setEditingSimpleRuleKey(key)} title={t('edit')} className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                            <EditIcon />
                        </button>
                        <button onClick={() => onDelete(key, 'simple')} title={t('deleteRule')} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                            <ClearIcon />
                        </button>
                    </div>
                </div>
            ))}

            {contextualRules.length > 0 && <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">{t('contextualPositioning')}</h3>}
            {contextualRules.map((rule, index) => (
                <div key={index} className="p-2 border rounded-md flex justify-between items-start dark:border-gray-600">
                    <div className="flex items-center gap-1 flex-wrap">
                        {(rule.left || []).map((name: string, i: number) => (name.startsWith('@') || name.startsWith('$')) ? <span key={`l-${i}`} className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 p-1 rounded font-mono opacity-70">{name}</span> : <div key={`l-${i}`} className="opacity-60"><GlyphTile character={allCharsByName.get(name)!} glyphData={glyphDataMap.get(allCharsByName.get(name)!.unicode)} strokeThickness={strokeThickness} /></div>)}
                        <GlyphTile character={allCharsByName.get(rule.target)!} glyphData={glyphDataMap.get(allCharsByName.get(rule.target)!.unicode)} strokeThickness={strokeThickness} />
                        {(rule.right || []).map((name: string, i: number) => (name.startsWith('@') || name.startsWith('$')) ? <span key={`r-${i}`} className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 p-1 rounded font-mono opacity-70">{name}</span> : <div key={`r-${i}`} className="opacity-60"><GlyphTile character={allCharsByName.get(name)!} glyphData={glyphDataMap.get(allCharsByName.get(name)!.unicode)} strokeThickness={strokeThickness} /></div>)}
                        <span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span>
                        <span className="font-mono p-1 bg-gray-100 dark:bg-gray-700 rounded">{rule.space}</span>
                    </div>
                    <div><button onClick={() => setEditingContextualRuleIndex(index)} className="p-1"><EditIcon/></button><button onClick={() => onDelete(index, 'contextual')} className="p-1"><TrashIcon/></button></div>
                </div>
            ))}
            
            <GlyphSelectionModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelect={handleGlyphSelect}
                characterSets={allCharacterSets}
                glyphDataMap={glyphDataMap}
            />
        </div>
    )
};

export default DistRulesEditor;
