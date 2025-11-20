import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, EditIcon, SaveIcon, TrashIcon, ClearIcon } from '../../constants';
import { Character, CharacterSet, GlyphData } from '../../types';
import GlyphSelect from './GlyphSelect';
import RuleEditor, { RuleType } from '../RuleEditor';
import ExistingRuleDisplay from '../rules/ExistingRuleDisplay';
import { useLayout } from '../../contexts/LayoutContext';

interface LookupsPaneProps {
    lookups: Record<string, any>;
    onAddLookup: (name: string) => boolean;
    onUpdateLookup: (oldName: string, newName: string) => boolean;
    onDeleteLookup: (name: string) => void;
    onSaveRule: (lookupName: string, rule: any, type: RuleType, context: 'lookup') => void;
    onUpdateRule: (lookupName: string, oldKey: string, rule: any, type: RuleType, context: 'lookup') => void;
    onDeleteRule: (context: 'lookup', lookupName: string, key: string, type: RuleType) => void;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    groups: Record<string, string[]>;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
}

const LookupsPane: React.FC<LookupsPaneProps> = ({
    lookups, onAddLookup, onUpdateLookup, onDeleteLookup, onSaveRule, onUpdateRule, onDeleteRule,
    allCharacterSets, allCharsByName, groups, glyphDataMap, strokeThickness
}) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [editingNameKey, setEditingNameKey] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [expandedLookups, setExpandedLookups] = useState<Set<string>>(new Set());
    const [addingRule, setAddingRule] = useState<{ lookupKey: string; type: RuleType } | null>(null);
    const [editingRule, setEditingRule] = useState<{ lookupKey: string; key: string; type: RuleType, value: any } | null>(null);

    const handleAddClick = () => { setIsAdding(true); setInputValue(''); };
    const handleEditNameClick = (key: string) => { setEditingNameKey(key); setInputValue(key); };
    const handleSaveName = () => { if (isAdding) { if (onAddLookup(inputValue)) setIsAdding(false); } else if (editingNameKey) { if (onUpdateLookup(editingNameKey, inputValue)) setEditingNameKey(null); } setInputValue(''); };
    const handleCancelNameEdit = () => { setIsAdding(false); setEditingNameKey(null); setInputValue(''); };
    const toggleExpand = (key: string) => {
        setExpandedLookups(prev => { const newSet = new Set(prev); newSet.has(key) ? newSet.delete(key) : newSet.add(key); return newSet; });
        setAddingRule(null); setEditingRule(null);
    };

    const ruleTypesAndTitles: { [key: string]: string } = {
        liga: t('ligatureRules'),
        single: t('singleSubstitutionRules'),
        multiple: t('multipleSubstitutionRules'),
        context: t('contextualRules'),
    };

    const renderRuleSection = (lookupKey: string, title: string, rules: { [key: string]: any }, ruleType: RuleType) => {
        const isAddingThisType = addingRule?.lookupKey === lookupKey && addingRule.type === ruleType;
        const hasExistingRules = rules && Object.keys(rules).length > 0;

        return (
            <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 border-b pb-1 mb-2">{title}</h4>
                {isAddingThisType && (
                    <RuleEditor
                        isNew={true}
                        ruleType={addingRule!.type}
                        onSave={(newRule, type) => { onSaveRule(lookupKey, newRule, type, 'lookup'); setAddingRule(null); }}
                        onCancel={() => setAddingRule(null)}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        glyphDataMap={glyphDataMap}
                        strokeThickness={strokeThickness}
                        showNotification={showNotification}
                        mode="creating"
                        groups={groups}
                    />
                )}
                {hasExistingRules ? Object.entries(rules).map(([key, value]) => (
                    editingRule?.lookupKey === lookupKey && editingRule.key === key && editingRule.type === ruleType ? (
                        <RuleEditor
                            key={key}
                            isNew={false}
                            ruleKey={key}
                            ruleValue={value}
                            ruleType={ruleType}
                            onSave={(updatedRule) => { onUpdateRule(lookupKey, key, updatedRule, ruleType, 'lookup'); setEditingRule(null); }}
                            onCancel={() => setEditingRule(null)}
                            allCharacterSets={allCharacterSets}
                            allCharsByName={allCharsByName}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            showNotification={showNotification}
                            mode="creating"
                            groups={groups}
                        />
                    ) : (
                        <ExistingRuleDisplay
                            key={key}
                            ruleKey={key}
                            ruleValue={value}
                            ruleType={ruleType}
                            onEdit={() => setEditingRule({ lookupKey, key, type: ruleType, value })}
                            onDelete={() => onDeleteRule('lookup', lookupKey, key, ruleType)}
                            allCharsByName={allCharsByName}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            mode="creating"
                        />
                    )
                )) : <p className="text-xs text-gray-500 italic">No rules defined.</p>}
            </div>
        );
      };


    return (
        <div className="space-y-4">
            {!isAdding && !editingNameKey && (<button onClick={handleAddClick} disabled={isAdding || !!editingNameKey} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <AddIcon className="w-5 h-5"/> {t('add')} Lookup
            </button>)}
            {isAdding && (<div className="p-4 border-2 border-dashed border-indigo-400 rounded-lg flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20"><input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveName()} placeholder="new_lookup" className="w-full p-2 text-lg font-mono border rounded dark:bg-gray-900 dark:border-gray-600" /><button onClick={handleSaveName}><SaveIcon /></button><button onClick={handleCancelNameEdit}><ClearIcon /></button></div>)}
            
            <div className="space-y-4">
                {Object.keys(lookups).sort().map(key => {
                    const lookupData = lookups[key];
                    const isExpanded = expandedLookups.has(key);

                    return (
                        <div key={key} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md border dark:border-gray-700">
                             <div className="flex justify-between items-center">
                                {editingNameKey === key ? (
                                    <div className="flex items-center gap-1 flex-grow"><input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveName()} className="w-full p-2 text-lg font-mono border rounded dark:bg-gray-900 dark:border-gray-600" /><button onClick={handleSaveName}><SaveIcon /></button><button onClick={handleCancelNameEdit}><ClearIcon /></button></div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400">{key}</h3>
                                        <button onClick={() => handleEditNameClick(key)} className="p-1 text-gray-500 hover:text-indigo-500 rounded-full opacity-50 hover:opacity-100"><EditIcon /></button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => onDeleteLookup(key)} title={t('delete')} className="p-2 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50">
                                        <TrashIcon />
                                    </button>
                                    <button onClick={() => toggleExpand(key)} className={`p-2 rounded-full transform transition-transform ${isExpanded ? 'rotate-180 bg-indigo-100 dark:bg-indigo-900/50' : ''}`}>
                                        ▼
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="mt-4 pt-4 border-t dark:border-gray-700 space-y-4">
                                    {Object.entries(ruleTypesAndTitles).map(([ruleGroupKey, title]) => renderRuleSection(key, title, lookupData[ruleGroupKey] || {}, ruleGroupKey as RuleType))}
                                    <div className="pt-2 flex items-center gap-2 flex-wrap text-sm">
                                        <span className="font-semibold">{t('addNewRule')}:</span>
                                        <button onClick={() => { setEditingRule(null); setAddingRule({ lookupKey: key, type: 'single' }); }} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewSingleRule')}</button>
                                        <button onClick={() => { setEditingRule(null); setAddingRule({ lookupKey: key, type: 'multiple' }); }} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewMultipleRule')}</button>
                                        <button onClick={() => { setEditingRule(null); setAddingRule({ lookupKey: key, type: 'ligature' }); }} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewLigatureRule')}</button>
                                        <button onClick={() => { setEditingRule(null); setAddingRule({ lookupKey: key, type: 'contextual' }); }} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewContextualRule')}</button>
                                    </div>
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