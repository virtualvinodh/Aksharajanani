
import React, { useState, useMemo } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, EditIcon, SaveIcon, TrashIcon } from '../../constants';
import RuleEditor, { RuleType } from '../RuleEditor';
import ExistingRuleDisplay from './ExistingRuleDisplay';
import { Character, CharacterSet, GlyphData } from '../../types';

interface LookupsPaneProps {
    lookups: Record<string, any>;
    expandedLookups: Set<string>;
    onToggleLookup: (key: string) => void;
    onAddLookup: (name: string) => boolean;
    onUpdateLookup: (oldName: string, newName: string) => boolean;
    onDeleteLookup: (name: string) => void;
    onSaveRule: (lookupName: string, rule: any, type: RuleType, context: 'lookup') => void;
    onUpdateRule: (lookupName: string, oldKey: string, rule: any, type: RuleType, context: 'lookup') => void;
    onDeleteRule: (context: 'lookup', lookupName: string, key: string, type: RuleType) => void;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    groups: Record<string, string[]>;
    glyphVersion: number;
}

const LookupsPane: React.FC<LookupsPaneProps> = ({
    lookups, expandedLookups, onToggleLookup, onAddLookup, onUpdateLookup, onDeleteLookup,
    onSaveRule, onUpdateRule, onDeleteRule, allCharacterSets, allCharsByName,
    glyphDataMap, strokeThickness, groups, glyphVersion
}) => {
    const { t } = useLocale();
    
    const [editingNameKey, setEditingNameKey] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [inputValue, setInputValue] = useState('');

    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<{ lookupKey: string, key: string, type: RuleType } | null>(null);
    
    const handleAddClick = () => {
        setIsAdding(true);
        setInputValue('');
    };

    const handleEditNameClick = (key: string) => {
        setEditingNameKey(key);
        setInputValue(key);
    };
    
    const handleSaveName = () => {
        if (isAdding) {
            if (onAddLookup(inputValue)) {
                setIsAdding(false);
            }
        } else if (editingNameKey) {
            if (onUpdateLookup(editingNameKey, inputValue)) {
                setEditingNameKey(null);
            }
        }
        setInputValue('');
    };

    const handleCancelNameEdit = () => {
        setIsAdding(false);
        setEditingNameKey(null);
        setInputValue('');
    };

    const handleToggleExpand = (key: string) => {
        onToggleLookup(key);
        // Reset local editors when a tile is toggled
        setAddingRuleType(null);
        setEditingRule(null);
    };
    
    const renderRuleSection = (lookupKey: string, title: string, rules: { [key: string]: any }, ruleType: RuleType) => {
        const isAddingThisType = addingRuleType === ruleType && !editingRule;
        const isEditingThisType = editingRule?.lookupKey === lookupKey && editingRule?.type === ruleType;
        const hasExistingRules = Object.keys(rules).length > 0;
    
        if (!hasExistingRules && !isAddingThisType && !isEditingThisType) {
            return null;
        }
    
        return (
            <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 border-b pb-1">{title}</h4>
                {isAddingThisType && (
                    <RuleEditor
                        isNew={true}
                        ruleType={addingRuleType!} 
                        onSave={(newRule, type) => { onSaveRule(lookupKey, newRule, type, 'lookup'); setAddingRuleType(null); }}
                        onCancel={() => setAddingRuleType(null)}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        glyphDataMap={glyphDataMap}
                        strokeThickness={strokeThickness}
                        showNotification={() => {}}
                        mode="editing"
                        groups={groups}
                        glyphVersion={glyphVersion}
                    />
                )}
                {Object.entries(rules).map(([key, value]) => (
                    editingRule?.lookupKey === lookupKey && editingRule?.key === key && editingRule?.type === ruleType ? (
                        <RuleEditor
                            key={key}
                            isNew={false}
                            ruleKey={key}
                            ruleValue={value}
                            ruleType={ruleType}
                            onSave={(updatedRule, type) => { onUpdateRule(lookupKey, key, updatedRule, type, 'lookup'); setEditingRule(null); }}
                            onCancel={() => setEditingRule(null)}
                            allCharacterSets={allCharacterSets}
                            allCharsByName={allCharsByName}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            showNotification={() => {}}
                            mode="editing"
                            groups={groups}
                            glyphVersion={glyphVersion}
                        />
                    ) : (
                        <ExistingRuleDisplay
                            key={key}
                            ruleKey={key}
                            ruleValue={value}
                            ruleType={ruleType}
                            onEdit={() => setEditingRule({ lookupKey, key, type: ruleType })}
                            onDelete={() => onDeleteRule('lookup', lookupKey, key, ruleType)}
                            allCharsByName={allCharsByName}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            mode="editing"
                            glyphVersion={glyphVersion}
                        />
                    )
                ))}
            </div>
        );
      };

    return (
        <div className="space-y-4">
            <div className="flex justify-start">
                 {!isAdding && !editingNameKey && (
                    <button onClick={handleAddClick} disabled={isAdding || !!editingNameKey} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <AddIcon className="w-5 h-5"/> {t('add')} Lookup
                    </button>
                )}
            </div>
            
            {isAdding && (
                 <div className="p-4 border-2 border-dashed border-indigo-400 rounded-lg flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20">
                    <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveName()} placeholder="new_lookup" className="w-full p-2 text-sm border rounded dark:bg-gray-900 dark:border-gray-600 font-mono" />
                    <button onClick={handleSaveName} className="p-2 text-green-500 rounded-full hover:bg-green-100 dark:hover:bg-green-900/50"><SaveIcon /></button>
                    <button onClick={handleCancelNameEdit} className="p-2 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon /></button>
                </div>
            )}
            
            <div className="space-y-4">
                {Object.keys(lookups).map(key => {
                    const isContentEditing = expandedLookups.has(key);
                    const isNameEditing = editingNameKey === key;
                    const lookupData = lookups[key];

                    return (
                        <div key={key} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md border dark:border-gray-700">
                             <div className="flex justify-between items-center">
                                {isNameEditing ? (
                                    <div className="flex items-center gap-1 flex-grow">
                                        <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveName()} className="w-full p-2 text-lg font-mono border rounded dark:bg-gray-900 dark:border-gray-600" />
                                        <button onClick={handleSaveName} className="p-2 text-green-500 rounded-full hover:bg-green-100 dark:hover:bg-green-900/50"><SaveIcon /></button>
                                        <button onClick={handleCancelNameEdit} className="p-2 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">{key}</h3>
                                        <button onClick={() => handleEditNameClick(key)} className="p-1 text-gray-500 hover:text-indigo-500 rounded-full opacity-50 hover:opacity-100"><EditIcon /></button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => handleToggleExpand(key)} title={t('edit')} className={`p-2 rounded-full transition-colors ${isContentEditing ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                                        <EditIcon />
                                    </button>
                                    <button onClick={() => onDeleteLookup(key)} title={t('delete')} className="p-2 text-white bg-red-600 rounded-full hover:bg-red-700">
                                        <TrashIcon />
                                    </button>
                                </div>
                            </div>

                            {isContentEditing && (
                                <div className="mt-4 pt-4 border-t dark:border-gray-700 space-y-6">
                                    {lookupData.lookupflags && Object.keys(lookupData.lookupflags).length > 0 && (
                                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm">
                                            <h4 className="font-bold mb-1 text-blue-800 dark:text-blue-200">Lookup Flags</h4>
                                            <pre className="font-mono text-xs text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                                                {Object.entries(lookupData.lookupflags).map(([flag, value]) => `lookupflag ${flag} ${value};`).join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                    {renderRuleSection(key, t('singleSubstitutionRules'), lookupData.single || {}, 'single')}
                                    {renderRuleSection(key, t('multipleSubstitutionRules'), lookupData.multi || {}, 'multiple')}
                                    {renderRuleSection(key, t('contextualRules'), lookupData.context || {}, 'contextual')}
                                    {renderRuleSection(key, t('ligatureRules'), lookupData.liga || {}, 'ligature')}
                                     {!addingRuleType && !editingRule && (
                                        <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                                            <div className="flex items-center justify-center gap-2 flex-wrap">
                                                <span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span>
                                                <button onClick={() => setAddingRuleType('single')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md">{t('addNewSingleRule')}</button>
                                                <button onClick={() => setAddingRuleType('ligature')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md">{t('addNewLigatureRule')}</button>
                                                <button onClick={() => setAddingRuleType('contextual')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md">{t('addNewContextualRule')}</button>
                                                <button onClick={() => setAddingRuleType('multiple')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md">{t('addNewMultipleRule')}</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(LookupsPane);
