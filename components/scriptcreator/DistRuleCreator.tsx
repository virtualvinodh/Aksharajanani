
import React, { useState, useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, CharacterSet } from '../../types';
import GlyphSelect from './GlyphSelect';
import { AddIcon, EditIcon, SaveIcon, TrashIcon } from '../../constants';

type DistContextualRuleValue = { target: string; space: string; left?: string[]; right?: string[]; };

interface DistRuleCreatorProps {
    rules: { simple?: { [key: string]: string }; contextual?: DistContextualRuleValue[] };
    setRules: React.Dispatch<React.SetStateAction<any>>;
    scriptTag: string;
    featureTag: string;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
}

const DistRuleCreator: React.FC<DistRuleCreatorProps> = ({ rules, setRules, scriptTag, featureTag, allCharacterSets, allCharsByName, showNotification }) => {
    const { t } = useLocale();
    const [addingType, setAddingType] = useState<'simple' | 'contextual' | null>(null);
    const [editingState, setEditingState] = useState<{ type: 'simple' | 'contextual', keyOrIndex: string | number, data: any } | null>(null);
    const [formState, setFormState] = useState({ target: '', value: '0', left: [''], right: [''] });

    useEffect(() => {
        if (editingState) {
            if (editingState.type === 'simple') {
                setFormState({ target: editingState.keyOrIndex as string, value: editingState.data, left: [''], right: [''] });
            } else {
                setFormState({
                    target: editingState.data.target,
                    value: editingState.data.space,
                    left: editingState.data.left || [''],
                    right: editingState.data.right || ['']
                });
            }
        } else if (addingType) {
            setFormState({ target: '', value: '0', left: [''], right: [''] });
        }
    }, [editingState, addingType]);

    const handleSave = () => {
        const type = editingState?.type || addingType;
        if (!type) return;

        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            if (!newRules[scriptTag][featureTag]) newRules[scriptTag][featureTag] = {};
            if (!newRules[scriptTag][featureTag][type]) {
                newRules[scriptTag][featureTag][type] = type === 'simple' ? {} : [];
            }
            const distFeature = newRules[scriptTag][featureTag];

            if (type === 'simple') {
                if (!formState.target) { showNotification(t('errorDistSimpleRule'), 'error'); return prev; }
                if (editingState) delete distFeature.simple[editingState.keyOrIndex as string];
                distFeature.simple[formState.target] = formState.value;
            } else { // contextual
                const { target, value, left, right } = formState;
                const cleanLeft = left.filter(Boolean);
                const cleanRight = right.filter(Boolean);
                if (!target || (cleanLeft.length === 0 && cleanRight.length === 0)) { showNotification(t('errorDistContextualRule'), 'error'); return prev; }
                const newRule = { target, space: value, ...(cleanLeft.length > 0 && { left: cleanLeft }), ...(cleanRight.length > 0 && { right: cleanRight }) };
                if (editingState) {
                    distFeature.contextual[editingState.keyOrIndex as number] = newRule;
                } else {
                    distFeature.contextual.push(newRule);
                }
            }
            return newRules;
        });

        setAddingType(null);
        setEditingState(null);
    };
    
    const handleDelete = (type: 'simple' | 'contextual', keyOrIndex: string | number) => {
        setRules(prev => {
            const newRules = JSON.parse(JSON.stringify(prev));
            const distFeature = newRules[scriptTag]?.[featureTag];
            if (!distFeature?.[type]) return prev;

            if (type === 'simple') {
                delete distFeature.simple[keyOrIndex as string];
            } else {
                distFeature.contextual.splice(keyOrIndex as number, 1);
            }
            return newRules;
        });
    };

    const handleCancel = () => {
        setAddingType(null);
        setEditingState(null);
    };

    const renderEditor = () => (
        <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg space-y-4 bg-indigo-50 dark:bg-indigo-900/20">
            {(editingState?.type || addingType) === 'simple' ? (
                 <div className="flex items-end gap-4 justify-center">
                    <GlyphSelect characterSets={allCharacterSets} value={formState.target} onChange={val => setFormState(s => ({...s, target: val}))} label={t('targetCharacter')} />
                    <div>
                        <label className="block text-sm font-medium">{t('ruleValue')}</label>
                        <input type="number" value={formState.value} onChange={e => setFormState(s => ({...s, value: e.target.value}))} className="w-24 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-end gap-4"><GlyphSelect characterSets={allCharacterSets} value={formState.target} onChange={val => setFormState(s => ({...s, target: val}))} label={t('targetCharacter')} /><div className="flex-shrink-0"><label className="block text-sm font-medium">{t('space')}</label><input type="number" value={formState.value} onChange={e => setFormState(s => ({...s, value: e.target.value}))} className="w-24 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div></div>
                    <div><label className="font-semibold text-sm">{t('leftContext')}</label>{formState.left.map((g, i) => <div key={i} className="flex items-center gap-2 mt-1"><GlyphSelect characterSets={allCharacterSets} value={g} onChange={val => setFormState(s => ({...s, left: s.left.map((item, idx) => idx === i ? val : item)}))} label={`${t('leftContext')} ${i+1}`} /><button onClick={() => setFormState(s => ({...s, left: s.left.filter((_, idx) => idx !== i)}))} className="p-1 text-red-500"><TrashIcon /></button></div>)}<button onClick={() => setFormState(s => ({...s, left: [...s.left, '']}))} className="mt-1 text-xs flex items-center gap-1"><AddIcon className="w-4 h-4" /> Add</button></div>
                    <div><label className="font-semibold text-sm">{t('rightContext')}</label>{formState.right.map((g, i) => <div key={i} className="flex items-center gap-2 mt-1"><GlyphSelect characterSets={allCharacterSets} value={g} onChange={val => setFormState(s => ({...s, right: s.right.map((item, idx) => idx === i ? val : item)}))} label={`${t('rightContext')} ${i+1}`} /><button onClick={() => setFormState(s => ({...s, right: s.right.filter((_, idx) => idx !== i)}))} className="p-1 text-red-500"><TrashIcon /></button></div>)}<button onClick={() => setFormState(s => ({...s, right: [...s.right, '']}))} className="mt-1 text-xs flex items-center gap-1"><AddIcon className="w-4 h-4" /> Add</button></div>
                </div>
            )}
            <div className="flex justify-end gap-2"><button onClick={handleCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{editingState ? t('updateRule') : t('saveRule')}</button></div>
        </div>
    );
    
    return <div className="space-y-6">
        {!(addingType || editingState) && (
            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center gap-4 flex-wrap">
                <span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span>
                <button onClick={() => setAddingType('simple')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSimpleDistRule')}</button>
                <button onClick={() => setAddingType('contextual')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualDistRule')}</button>
            </div>
        )}
        
        {(addingType || editingState) && renderEditor()}
        
        <div><h4 className="font-bold mb-2">{t('simplePositioning')}</h4><div className="space-y-2">
            {Object.entries(rules.simple || {}).map(([key, value]) => (
                <div key={key} className="p-2 border rounded-md flex justify-between items-center dark:border-gray-600"><div className="flex items-center gap-2"><span className="font-semibold">{key}</span><span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span><span className="font-mono p-1 bg-gray-100 dark:bg-gray-700 rounded">{value as string}</span></div><div><button onClick={() => setEditingState({type: 'simple', keyOrIndex: key, data: value})} className="p-1"><EditIcon/></button><button onClick={() => handleDelete('simple', key)} className="p-1"><TrashIcon/></button></div></div>
            ))}
        </div></div>

        <div><h4 className="font-bold mb-2">{t('contextualPositioning')}</h4><div className="space-y-2">
             {(rules.contextual || []).map((rule: DistContextualRuleValue, index: number) => (
                <div key={index} className="p-2 border rounded-md flex justify-between items-start dark:border-gray-600">
                    <div className="flex items-center gap-1 flex-wrap">
                        {(rule.left || []).map((r, i) => <span key={i} className="text-xs bg-gray-200 dark:bg-gray-600 p-1 rounded opacity-70">{r}</span>)}
                        <span className="font-semibold text-sm bg-indigo-100 dark:bg-indigo-900/50 p-1 rounded">{rule.target}</span>
                        {(rule.right || []).map((r, i) => <span key={i} className="text-xs bg-gray-200 dark:bg-gray-600 p-1 rounded opacity-70">{r}</span>)}
                        <span className="text-xl font-bold mx-2 text-indigo-500 dark:text-indigo-400">→</span>
                        <span className="font-mono p-1 bg-gray-100 dark:bg-gray-700 rounded">{rule.space}</span>
                    </div>
                    <div><button onClick={() => setEditingState({type: 'contextual', keyOrIndex: index, data: rule})} className="p-1"><EditIcon/></button><button onClick={() => handleDelete('contextual', index)} className="p-1"><TrashIcon/></button></div>
                </div>
            ))}
        </div></div>
    </div>
};

export default DistRuleCreator;
