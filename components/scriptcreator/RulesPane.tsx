import React, { useState, useMemo, useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, CharacterSet, GlyphData } from '../../types';
import { useLayout } from '../../contexts/LayoutContext';
import GroupsPane from '../rules/GroupsPane';
import LookupsPane from './LookupsPane';
import { EditIcon, TrashIcon, AddIcon, SaveIcon } from '../../constants';
import Modal from '../Modal';
import RuleEditor, { RuleType } from '../RuleEditor';
import ExistingRuleDisplay from '../rules/ExistingRuleDisplay';


interface RulesPaneProps {
    rules: any;
    setRules: React.Dispatch<React.SetStateAction<any>>;
    allCharsByName: Map<string, Character>;
    scriptTag: string;
    allCharacterSets: CharacterSet[];
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
}

const getRuleGroupKey = (type: RuleType) => ({ ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' })[type];

const RulesPane: React.FC<RulesPaneProps> = ({ rules, setRules, allCharsByName, scriptTag: initialScriptTag, allCharacterSets, glyphDataMap, strokeThickness }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [activeSubTab, setActiveSubTab] = useState('features');
    
    const [isEditingScriptTag, setIsEditingScriptTag] = useState(false);
    const [scriptTagInput, setScriptTagInput] = useState(initialScriptTag);
    const [editingFeature, setEditingFeature] = useState<string | null>(null);
    const [featureTagInput, setFeatureTagInput] = useState('');
    const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
    const [newFeatureTag, setNewFeatureTag] = useState('');
    const [lookupToAdd, setLookupToAdd] = useState('');

    // State for inline rule editing
    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<{ key: string; type: RuleType; value: any } | null>(null);

    const scriptTag = useMemo(() => Object.keys(rules).find(key => key !== 'groups' && key !== 'lookups') || 'dflt', [rules]);

    useEffect(() => { setScriptTagInput(scriptTag); }, [scriptTag]);

    const handleSaveScriptTag = () => {
        const newTag = scriptTagInput.trim();
        if (!/^[a-z0-9]{4}$/.test(newTag)) {
            showNotification(t('errorScriptTagInvalid'), 'error');
        } else if (newTag && newTag !== scriptTag) {
            setRules(prev => {
                const newRules = { ...prev, [newTag]: prev[scriptTag] };
                delete (newRules as any)[scriptTag];
                return newRules;
            });
        }
        setIsEditingScriptTag(false);
    };

    const features = useMemo(() => (scriptTag && rules[scriptTag] ? Object.keys(rules[scriptTag]) : []), [rules, scriptTag]);
    const [activeFeature, setActiveFeature] = useState(features[0] || null);

    const handleSaveFeatureTag = (oldFeature: string) => {
        const newTag = featureTagInput.trim();
        if (!/^[a-z0-9]{4}$/.test(newTag)) { showNotification(t('errorFeatureTagInvalid'), 'error'); }
        else if (newTag !== oldFeature && features.includes(newTag)) { showNotification(t('errorFeatureTagExists'), 'error'); }
        else if (newTag && newTag !== oldFeature) {
            setRules(prev => {
                const newRules = JSON.parse(JSON.stringify(prev));
                newRules[scriptTag][newTag] = newRules[scriptTag][oldFeature];
                delete newRules[scriptTag][oldFeature];
                return newRules;
            });
            setActiveFeature(newTag);
        }
        setEditingFeature(null);
    };

    const handleAddFeature = () => {
        const tag = newFeatureTag.trim();
        if (!/^[a-z0-9]{4}$/.test(tag)) { showNotification(t('errorFeatureTagInvalid'), 'error'); return; }
        if (features.includes(tag)) { showNotification(t('errorFeatureTagExists'), 'error'); return; }
        setRules(prev => ({ ...prev, [scriptTag]: { ...prev[scriptTag], [tag]: { children: [{type: 'inline'}] } } }));
        setActiveFeature(tag);
        setIsAddFeatureModalOpen(false);
        setNewFeatureTag('');
    };
    
    useEffect(() => {
        if (features.length > 0 && (!activeFeature || !features.includes(activeFeature))) {
          setActiveFeature(features[0]);
        }
    }, [features, activeFeature]);

    const groups = useMemo(() => rules.groups || {}, [rules]);
    const lookups = useMemo(() => rules.lookups || {}, [rules]);
    
    const handleSaveGroup = ({ originalKey, newKey, members }: { originalKey?: string, newKey: string, members: string[] }) => {
        setRules(prev => { const newGroups = { ...(prev.groups || {}) }; if (originalKey && originalKey !== newKey) delete newGroups[originalKey]; newGroups[newKey] = members; return { ...prev, groups: newGroups }; });
    };
    const handleDeleteGroup = (key: string) => {
        setRules(prev => { const newGroups = { ...(prev.groups || {}) }; delete newGroups[key]; return { ...prev, groups: newGroups }; });
    };

    const handleAddLookup = (name: string): boolean => {
        const trimmedName = name.trim();
        if (!trimmedName || lookups[trimmedName]) { showNotification('Invalid or duplicate lookup name.', 'error'); return false; }
        setRules(p => ({...p, lookups: {...(p.lookups || {}), [trimmedName]: {}}}));
        return true;
    };
    const handleUpdateLookup = (oldName: string, newName: string): boolean => {
        const trimmedNewName = newName.trim();
        if (!trimmedNewName || (trimmedNewName !== oldName && lookups[trimmedNewName])) { showNotification('Invalid or duplicate lookup name.', 'error'); return false; }
        setRules(p => { const nl = {...(p.lookups || {})}; nl[trimmedNewName] = nl[oldName]; delete nl[oldName]; return {...p, lookups: nl}; });
        return true;
    };
    const handleDeleteLookup = (name: string) => {
        setRules(p => { const nl = {...(p.lookups || {})}; delete nl[name]; return {...p, lookups: nl}; });
    };

    const onSaveRule = (lookupName: string, rule: any, type: RuleType, context: 'lookup') => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroupKey = getRuleGroupKey(type);
            if (!newRules.lookups) newRules.lookups = {};
            if (!newRules.lookups[lookupName]) newRules.lookups[lookupName] = {};
            if (!newRules.lookups[lookupName][ruleGroupKey]) newRules.lookups[lookupName][ruleGroupKey] = {};
    
            if (type === 'ligature') newRules.lookups[lookupName][ruleGroupKey][rule.ligatureName] = rule.componentNames;
            else if (type === 'single') newRules.lookups[lookupName][ruleGroupKey][rule.outputName] = rule.inputName;
            else if (type === 'multiple') newRules.lookups[lookupName][ruleGroupKey][rule.outputString] = rule.inputName;
            else if (type === 'contextual') newRules.lookups[lookupName][ruleGroupKey][rule.replacementName] = rule.rule;
            return newRules;
        });
    };
    
    const onUpdateRule = (lookupName: string, oldKey: string, rule: any, type: RuleType, context: 'lookup') => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroupKey = getRuleGroupKey(type);
            const lookup = newRules.lookups?.[lookupName]?.[ruleGroupKey];
            if (lookup?.[oldKey]) delete lookup[oldKey];
            
            if (type === 'ligature') lookup[rule.ligatureName] = rule.componentNames;
            else if (type === 'single') lookup[rule.outputName] = rule.inputName;
            else if (type === 'multiple') lookup[rule.outputString] = rule.inputName;
            else if (type === 'contextual') lookup[rule.replacementName] = rule.rule;
            return newRules;
        });
    };
    
    const onDeleteRule = (context: 'lookup', lookupName: string, key: string, type: RuleType) => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroupKey = getRuleGroupKey(type);
            const lookup = newRules.lookups?.[lookupName]?.[ruleGroupKey];
            if (lookup?.[key]) delete lookup[key];
            return newRules;
        });
    };
    
    const handleAddLookupReference = (feature: string, lookup: string) => {
        if (!feature || !lookup) return;
        setRules(prev => { const newRules = JSON.parse(JSON.stringify(prev)); const f = newRules[scriptTag]?.[feature]; if (f) { if (!f.children) f.children = []; f.children.push({ type: 'lookup', name: lookup }); } return newRules; });
    };
    const handleRemoveLookupReference = (feature: string, index: number) => {
        if (!feature) return;
        setRules(prev => { const newRules = JSON.parse(JSON.stringify(prev)); const f = newRules[scriptTag]?.[feature]; if (f?.children) f.children.splice(index, 1); return newRules; });
    };
    const handleReorderFeatureItem = (feature: string, from: number, to: number) => {
        if (!feature || to < 0 || to >= rules[scriptTag]?.[feature]?.children?.length) return;
        setRules(prev => { const newRules = JSON.parse(JSON.stringify(prev)); const f = newRules[scriptTag]?.[feature]; if (f?.children) { const [moved] = f.children.splice(from, 1); f.children.splice(to, 0, moved); } return newRules; });
    };

    const activeFeatureData = useMemo(() => (scriptTag && activeFeature && rules[scriptTag]?.[activeFeature]) ? rules[scriptTag][activeFeature] : {}, [rules, scriptTag, activeFeature]);
    const activeLigatureRules = useMemo(() => activeFeatureData.liga || {}, [activeFeatureData]);
    const activeContextualRules = useMemo(() => activeFeatureData.context || {}, [activeFeatureData]);
    const activeMultipleRules = useMemo(() => activeFeatureData.multi || {}, [activeFeatureData]);
    const activeSingleRules = useMemo(() => activeFeatureData.single || {}, [activeFeatureData]);
    
    const handleSaveNewInlineRule = (featureName: string, newRule: any, ruleType: RuleType) => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroup = getRuleGroupKey(ruleType);
            const feature = newRules[scriptTag][featureName];
            if (!feature[ruleGroup]) feature[ruleGroup] = {};
            if (ruleType === 'ligature') feature[ruleGroup][newRule.ligatureName] = newRule.componentNames;
            else if (ruleType === 'contextual') feature[ruleGroup][newRule.replacementName] = newRule.rule;
            else if (ruleType === 'multiple') feature[ruleGroup][newRule.outputString] = newRule.inputName;
            else if (ruleType === 'single') feature[ruleGroup][newRule.outputName] = newRule.inputName;
            return newRules;
        });
        setAddingRuleType(null);
    };

    const handleUpdateInlineRule = (featureName: string, oldKey: string, updatedRule: any, ruleType: RuleType) => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroup = getRuleGroupKey(ruleType);
            const feature = newRules[scriptTag][featureName];
            if (feature[ruleGroup]?.[oldKey]) delete feature[ruleGroup][oldKey];
            if (ruleType === 'ligature') feature[ruleGroup][updatedRule.ligatureName] = updatedRule.componentNames;
            else if (ruleType === 'contextual') feature[ruleGroup][updatedRule.replacementName] = updatedRule.rule;
            else if (ruleType === 'multiple') feature[ruleGroup][updatedRule.outputString] = updatedRule.inputName;
            else if (ruleType === 'single') feature[ruleGroup][updatedRule.outputName] = updatedRule.inputName;
            return newRules;
        });
        setEditingRule(null);
    };

    const handleDeleteInlineRule = (featureName: string, ruleKey: string, ruleType: RuleType) => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const ruleGroup = getRuleGroupKey(ruleType);
            const feature = newRules[scriptTag]?.[featureName];
            if (feature?.[ruleGroup]?.[ruleKey]) {
                delete feature[ruleGroup][ruleKey];
            }
            return newRules;
        });
    };

    const renderRuleSection = (title: string, rules: { [key: string]: any }, ruleType: RuleType) => {
        const hasExistingRules = Object.keys(rules).length > 0;
        const isAddingThisType = addingRuleType === ruleType && !editingRule;
        const isEditingThisType = editingRule?.type === ruleType;
        if (!hasExistingRules && !isAddingThisType && !isEditingThisType) return null;
    
        return (
            <div className="space-y-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 border-b pb-1">{title}</h4>
                {isAddingThisType && activeFeature && (
                    <RuleEditor
                        isNew
                        ruleType={ruleType}
                        onSave={(newRule, type) => handleSaveNewInlineRule(activeFeature, newRule, type)}
                        onCancel={() => setAddingRuleType(null)}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        glyphDataMap={new Map<number, GlyphData>()} 
                        strokeThickness={15}
                        showNotification={showNotification}
                        mode="creating"
                        groups={groups}
                    />
                )}
                {Object.entries(rules).map(([key, value]) => (
                    editingRule?.key === key && editingRule?.type === ruleType ? (
                        <RuleEditor
                            key={key}
                            isNew={false}
                            ruleKey={key}
                            ruleValue={value}
                            ruleType={ruleType}
                            onSave={(updatedRule) => handleUpdateInlineRule(activeFeature!, key, updatedRule, ruleType)}
                            onCancel={() => setEditingRule(null)}
                            allCharacterSets={allCharacterSets}
                            allCharsByName={allCharsByName}
                            glyphDataMap={new Map<number, GlyphData>()}
                            strokeThickness={15}
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
                            onEdit={() => setEditingRule({ key, type: ruleType, value })}
                            onDelete={() => handleDeleteInlineRule(activeFeature!, key, ruleType)}
                            allCharsByName={allCharsByName}
                            mode="creating"
                        />
                    )
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('rulesTabDescription')}</h3></div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                 <div className="mb-4">
                    <div className="flex border-b border-gray-200 dark:border-gray-700">
                        <button onClick={() => setActiveSubTab('groups')} className={`px-4 py-2 text-sm font-medium ${activeSubTab === 'groups' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>{t('glyphGroups')}</button>
                        <button onClick={() => setActiveSubTab('lookups')} className={`px-4 py-2 text-sm font-medium ${activeSubTab === 'lookups' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>{t('lookups')}</button>
                        <button onClick={() => setActiveSubTab('features')} className={`px-4 py-2 text-sm font-medium ${activeSubTab === 'features' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>{t('rulesTabDescription')}</button>
                    </div>
                </div>

                {activeSubTab === 'groups' && <GroupsPane groups={groups} onSave={handleSaveGroup} onDelete={handleDeleteGroup} characterSets={allCharacterSets} />}
                
                {activeSubTab === 'lookups' && (
                     <LookupsPane
                        lookups={lookups}
                        onAddLookup={handleAddLookup}
                        onUpdateLookup={handleUpdateLookup}
                        onDeleteLookup={handleDeleteLookup}
                        onSaveRule={onSaveRule}
                        onUpdateRule={onUpdateRule}
                        onDeleteRule={onDeleteRule}
                        allCharacterSets={allCharacterSets}
                        allCharsByName={allCharsByName}
                        groups={groups}
                        glyphDataMap={glyphDataMap}
                        strokeThickness={strokeThickness}
                    />
                )}

                {activeSubTab === 'features' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold">Script:</h4>
                             {isEditingScriptTag ? <input type="text" value={scriptTagInput} onChange={e => setScriptTagInput(e.target.value)} onBlur={handleSaveScriptTag} onKeyDown={e => e.key==='Enter' && handleSaveScriptTag()} autoFocus className="font-mono p-1 border rounded dark:bg-gray-700 dark:border-gray-600" /> : <><span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded">{scriptTag}</span><button onClick={()=>setIsEditingScriptTag(true)}><EditIcon/></button></>}
                        </div>
                        <div className="border rounded-md dark:border-gray-600">
                            <div className="flex bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 flex-wrap">
                                {features.map(f => (
                                     <div key={f} className="flex items-center">
                                        {editingFeature === f ? (
                                            <input type="text" value={featureTagInput} onChange={e=>setFeatureTagInput(e.target.value)} onBlur={()=>handleSaveFeatureTag(f)} onKeyDown={e=> e.key==='Enter' && handleSaveFeatureTag(f)} autoFocus className="p-2 text-sm font-mono bg-transparent border-b-2 border-indigo-500" />
                                        ) : (
                                            <button onClick={()=>{setActiveFeature(f); setAddingRuleType(null); setEditingRule(null);}} className={`p-2 text-sm font-mono ${activeFeature === f ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}>{f}</button>
                                        )}
                                        {activeFeature === f && !editingFeature && <button onClick={()=>{setEditingFeature(f); setFeatureTagInput(f);}}><EditIcon/></button>}
                                    </div>
                                ))}
                                <button onClick={()=>setIsAddFeatureModalOpen(true)} className="p-2"><AddIcon className="w-4 h-4"/></button>
                            </div>
                            {activeFeature && <div className="p-4 space-y-4">
                                {(rules[scriptTag]?.[activeFeature]?.children || []).map((child: any, index: number) => {
                                    const isFirst = index === 0;
                                    const isLast = index === rules[scriptTag][activeFeature].children.length - 1;

                                    if (child.type === 'inline') {
                                        return (
                                            <div key={`inline-${index}`} className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 pt-8 space-y-4">
                                                <div className="absolute top-2 right-2 flex gap-1"><button onClick={()=>handleReorderFeatureItem(activeFeature, index, index - 1)} disabled={isFirst} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">↑</button><button onClick={()=>handleReorderFeatureItem(activeFeature, index, index + 1)} disabled={isLast} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">↓</button></div>
                                                <span className="absolute top-2 left-2 text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">Inline Rules</span>
                                                
                                                {renderRuleSection(t('singleSubstitutionRules'), activeSingleRules, 'single')}
                                                {renderRuleSection(t('multipleSubstitutionRules'), activeMultipleRules, 'multiple')}
                                                {renderRuleSection(t('contextualRules'), activeContextualRules, 'contextual')}
                                                {renderRuleSection(t('ligatureRules'), activeLigatureRules, 'ligature')}
                                                
                                                {!addingRuleType && !editingRule && (
                                                    <div className="pt-2 flex items-center justify-center gap-2 flex-wrap text-sm">
                                                        <span className="font-semibold">{t('addNewRule')}:</span>
                                                        <button onClick={() => setAddingRuleType('single')} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewSingleRule')}</button>
                                                        <button onClick={() => setAddingRuleType('multiple')} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewMultipleRule')}</button>
                                                        <button onClick={() => setAddingRuleType('ligature')} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewLigatureRule')}</button>
                                                        <button onClick={() => setAddingRuleType('contextual')} className="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded">{t('addNewContextualRule')}</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                    if (child.type === 'lookup') {
                                        return (
                                            <div key={`${child.name}-${index}`} className="relative flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                                                <div><span className="text-xs text-gray-500">Lookup</span><p className="font-mono text-indigo-600 dark:text-indigo-400">{child.name}</p></div>
                                                <div className="flex gap-1"><button onClick={()=>handleReorderFeatureItem(activeFeature, index, index - 1)} disabled={isFirst} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">↑</button><button onClick={()=>handleReorderFeatureItem(activeFeature, index, index + 1)} disabled={isLast} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">↓</button><button onClick={()=>handleRemoveLookupReference(activeFeature, index)} title="Remove Lookup Reference" className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><TrashIcon /></button></div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}

                                <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg mt-6">
                                    <div className="flex items-center justify-center gap-4">
                                        <select value={lookupToAdd} onChange={e => setLookupToAdd(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600"><option value="">Add Lookup Reference...</option>{Object.keys(lookups).map(name => <option key={name} value={name}>{name}</option>)}</select>
                                        <button onClick={() => handleAddLookupReference(activeFeature!, lookupToAdd)} disabled={!lookupToAdd} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">{t('add')} Lookup</button>
                                    </div>
                                </div>
                            </div>}
                        </div>
                    </div>
                )}
            </div>
            {isAddFeatureModalOpen && <Modal isOpen={isAddFeatureModalOpen} onClose={() => setIsAddFeatureModalOpen(false)} title={t('addFeature')} footer={<><button onClick={() => setIsAddFeatureModalOpen(false)}>{t('cancel')}</button><button onClick={handleAddFeature}>{t('add')}</button></>}>
                <input type="text" value={newFeatureTag} onChange={e => setNewFeatureTag(e.target.value)} placeholder="e.g., liga" maxLength={4} />
            </Modal>}
        </div>
    );
};

export default RulesPane;