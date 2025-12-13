
import React, { useState } from 'react';
import { AttachmentClass, CharacterSet } from '../../../types';
import { useLocale } from '../../../contexts/LocaleContext';
import { AddIcon, TrashIcon, EditIcon, SaveIcon, CloseIcon } from '../../../constants';
import SmartGlyphInput from './SmartGlyphInput';
import { expandMembers } from '../../../services/groupExpansionService';

interface GroupManagerProps {
    groups: Record<string, string[]>;
    setGroups: (groups: Record<string, string[]>) => void;
    markClasses: AttachmentClass[];
    setMarkClasses: (classes: AttachmentClass[]) => void;
    baseClasses: AttachmentClass[];
    setBaseClasses: (classes: AttachmentClass[]) => void;
    characterSets: CharacterSet[];
}

const fontStyle = {
    fontFamily: 'var(--guide-font-family)',
    fontFeatureSettings: 'var(--guide-font-feature-settings)'
};

const GroupCard: React.FC<{
    title: string;
    members: string[];
    applies?: string[];
    exceptions?: string[];
    exceptPairs?: string[];
    type: 'group' | 'class';
    onDelete: () => void;
    onEdit: () => void;
}> = ({ title, members, applies, exceptions, exceptPairs, type, onDelete, onEdit }) => {
    const { t } = useLocale();
    const isGroup = type === 'group';
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative group">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${isGroup ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'}`}>
                        {type}
                    </span>
                    <h4 className="font-mono font-bold text-gray-800 dark:text-gray-200 text-lg">{title}</h4>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={onEdit} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><EditIcon className="w-4 h-4" /></button>
                    <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
                {members.slice(0, 8).map((m, i) => (
                    <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded border dark:border-gray-600 font-mono" style={fontStyle}>
                        {m}
                    </span>
                ))}
                {members.length > 8 && (
                    <span className="text-xs text-gray-400 self-center">+{members.length - 8} {t('more')}</span>
                )}
            </div>

            {(applies && applies.length > 0) && (
                <div className="mt-2 pt-2 border-t dark:border-gray-700">
                    <span className="text-[10px] uppercase font-bold text-gray-500">{t('appliesTo')}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {applies.slice(0, 5).map((m, i) => (
                            <span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 font-mono" style={fontStyle}>{m}</span>
                        ))}
                        {applies.length > 5 && <span className="text-xs text-gray-400">+{applies.length - 5}</span>}
                    </div>
                </div>
            )}

            {(exceptions && exceptions.length > 0) && (
                <div className="mt-2 pt-2 border-t dark:border-gray-700">
                    <span className="text-[10px] uppercase font-bold text-gray-500">{t('exceptions')}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {exceptions.slice(0, 5).map((m, i) => (
                            <span key={i} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-mono" style={fontStyle}>{m}</span>
                        ))}
                        {exceptions.length > 5 && <span className="text-xs text-gray-400">+{exceptions.length - 5}</span>}
                    </div>
                </div>
            )}

            {(exceptPairs && exceptPairs.length > 0) && (
                <div className="mt-2 pt-2 border-t dark:border-gray-700">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Unlinked Pairs</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {exceptPairs.slice(0, 5).map((m, i) => (
                            <span key={i} className="text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 px-1.5 py-0.5 rounded border border-orange-100 dark:border-orange-800 font-mono" style={fontStyle}>{m}</span>
                        ))}
                        {exceptPairs.length > 5 && <span className="text-xs text-gray-400">+{exceptPairs.length - 5}</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

const ChipInput: React.FC<{
    label: string;
    items: string[];
    onChange: (items: string[]) => void;
    placeholder: string;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    color?: string;
}> = ({ label, items, onChange, placeholder, characterSets, groups, color = "indigo" }) => {
    const [inputValue, setInputValue] = useState('');
    
    const addItem = () => {
        if (inputValue && !items.includes(inputValue)) {
            onChange([...items, inputValue]);
            setInputValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItem();
        }
    };

    return (
        <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
            <div className="flex flex-wrap gap-2 mb-2 p-2 min-h-[40px] bg-white dark:bg-gray-900 border rounded dark:border-gray-600">
                {items.map(m => {
                    return (
                        <span key={m} className={`inline-flex items-center gap-1 bg-${color}-100 dark:bg-${color}-900/40 text-${color}-800 dark:text-${color}-200 px-2 py-1 rounded text-sm font-mono group`} style={fontStyle}>
                            {m}
                            <button onClick={() => onChange(items.filter(x => x !== m))} className="hover:text-red-500 ml-1">&times;</button>
                        </span>
                    );
                })}
            </div>
            <div className="flex gap-2">
                <SmartGlyphInput 
                    value={inputValue} 
                    onChange={setInputValue} 
                    onKeyDown={handleKeyDown}
                    characterSets={characterSets} 
                    groups={groups} 
                    placeholder={placeholder}
                    className="flex-grow"
                />
                <button onClick={addItem} className={`px-4 bg-${color}-600 text-white rounded hover:bg-${color}-700 font-bold`}>+</button>
            </div>
        </div>
    );
};

const EditorPanel: React.FC<{
    title: string;
    nameValue?: string;
    onNameChange?: (val: string) => void;
    namePrefix?: string;
    
    members: string[];
    onMembersChange: (m: string[]) => void;
    
    applies?: string[];
    onAppliesChange?: (m: string[]) => void;
    
    exceptions?: string[];
    onExceptionsChange?: (m: string[]) => void;

    exceptPairs?: string[];
    onExceptPairsChange?: (m: string[]) => void;

    onSave: () => void;
    onCancel: () => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    showNameInput?: boolean;
}> = ({ title, nameValue, onNameChange, namePrefix = '', members, onMembersChange, applies, onAppliesChange, exceptions, onExceptionsChange, exceptPairs, onExceptPairsChange, onSave, onCancel, characterSets, groups, showNameInput = true }) => {
    const { t } = useLocale();

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 animate-fade-in-up col-span-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><CloseIcon /></button>
            </div>
            
            <div className="space-y-4">
                {showNameInput && onNameChange && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('glyphName')}</label>
                        <div className="flex items-center gap-2">
                             {namePrefix && <span className="text-gray-400 font-mono">{namePrefix}</span>}
                             <input 
                                type="text" 
                                value={nameValue} 
                                onChange={e => onNameChange(e.target.value)} 
                                className="flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono"
                                placeholder={namePrefix === '$' ? "consonants" : t('classNameOptional')}
                             />
                        </div>
                    </div>
                )}
                
                <ChipInput 
                    label={t('classMembers')}
                    items={members} 
                    onChange={onMembersChange} 
                    placeholder={t('typeGlyphOrGroup')}
                    characterSets={characterSets} 
                    groups={groups} 
                />

                {onAppliesChange && (
                     <ChipInput 
                        label={t('appliesToFilter')}
                        items={applies || []} 
                        onChange={onAppliesChange} 
                        placeholder={t('restrictToGlyphs')}
                        characterSets={characterSets} 
                        groups={groups}
                        color="blue"
                    />
                )}

                {onExceptionsChange && (
                     <ChipInput 
                        label={t('exceptionsFilter')}
                        items={exceptions || []} 
                        onChange={onExceptionsChange} 
                        placeholder={t('excludeGlyphs')}
                        characterSets={characterSets} 
                        groups={groups}
                        color="red"
                    />
                )}

                {onExceptPairsChange && (
                     <ChipInput 
                        label="Unlinked Pairs (Base-Mark)"
                        items={exceptPairs || []} 
                        onChange={onExceptPairsChange} 
                        placeholder="e.g. ka-u"
                        characterSets={characterSets} 
                        groups={groups}
                        color="orange"
                    />
                )}
                
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded">{t('cancel')}</button>
                    <button onClick={onSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"><SaveIcon className="w-4 h-4"/> {t('save')}</button>
                </div>
            </div>
        </div>
    );
};

const GroupManager: React.FC<GroupManagerProps> = ({ groups, setGroups, markClasses, setMarkClasses, baseClasses, setBaseClasses, characterSets }) => {
    const { t } = useLocale();
    const [editingState, setEditingState] = useState<{ type: 'group' | 'markClass' | 'baseClass', id: string | number, data: any } | null>(null);

    const handleSaveGroup = (key: string, newKey: string, members: string[]) => {
        const newGroups = { ...groups };
        if (key !== newKey) delete newGroups[key];
        newGroups[newKey] = members;
        setGroups(newGroups);
        setEditingState(null);
    };

    const handleSaveClass = (type: 'markClass' | 'baseClass', index: number, data: AttachmentClass) => {
        const setter = type === 'markClass' ? setMarkClasses : setBaseClasses;
        const collection = type === 'markClass' ? [...markClasses] : [...baseClasses];
        
        if (index === -1) {
            collection.push(data);
        } else {
            collection[index] = data;
        }
        setter(collection);
        setEditingState(null);
    };

    const handleDeleteGroup = (key: string) => {
        const newGroups = { ...groups };
        delete newGroups[key];
        setGroups(newGroups);
    };

    const handleDeleteClass = (type: 'markClass' | 'baseClass', index: number) => {
        const setter = type === 'markClass' ? setMarkClasses : setBaseClasses;
        const collection = type === 'markClass' ? [...markClasses] : [...baseClasses];
        collection.splice(index, 1);
        setter(collection);
    };

    const updateEditingData = (field: string, value: any) => {
        setEditingState(prev => prev ? { ...prev, data: { ...prev.data, [field]: value } } : null);
    };

    return (
        <div className="space-y-8">
            {/* 1. Global Groups Section */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{t('globalGroups')}</h3>
                        <p className="text-sm text-gray-500">{t('globalGroupsDesc')}</p>
                    </div>
                    <button 
                        onClick={() => setEditingState({ type: 'group', id: '', data: { key: '', members: [] } })}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    >
                        <AddIcon className="w-4 h-4" /> {t('addGroup')}
                    </button>
                </div>

                {/* Render "Add" panel at the top (id='') */}
                {editingState?.type === 'group' && editingState.id === '' && (
                    <EditorPanel 
                        title={t('newGroup')}
                        nameValue={editingState.data.key}
                        onNameChange={(val) => updateEditingData('key', val)}
                        namePrefix="$"
                        members={editingState.data.members}
                        onMembersChange={(m) => updateEditingData('members', m)}
                        onSave={() => handleSaveGroup('', editingState.data.key, editingState.data.members)}
                        onCancel={() => setEditingState(null)}
                        characterSets={characterSets}
                        groups={groups}
                    />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(groups).map(([key, members]) => (
                        (editingState?.type === 'group' && editingState.id === key) ? (
                            <EditorPanel 
                                key={key}
                                title={t('editGroup')}
                                nameValue={editingState.data.key}
                                onNameChange={(val) => updateEditingData('key', val)}
                                namePrefix="$"
                                members={editingState.data.members}
                                onMembersChange={(m) => updateEditingData('members', m)}
                                onSave={() => handleSaveGroup(key, editingState.data.key, editingState.data.members)}
                                onCancel={() => setEditingState(null)}
                                characterSets={characterSets}
                                groups={groups}
                            />
                        ) : (
                            <GroupCard 
                                key={key} 
                                title={`$${key}`} 
                                members={members} 
                                type="group" 
                                onDelete={() => handleDeleteGroup(key)}
                                onEdit={() => setEditingState({ type: 'group', id: key, data: { key, members } })}
                            />
                        )
                    ))}
                </div>
            </section>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* 2. Attachment Classes Section */}
            <section>
                <div className="flex justify-between items-center mb-4">
                     <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{t('attachmentClasses')}</h3>
                        <p className="text-sm text-gray-500">{t('attachmentClassesDesc')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Mark Classes */}
                    <div className="bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-teal-700 dark:text-teal-400">{t('markClasses')}</h4>
                            <button onClick={() => setEditingState({ type: 'markClass', id: -1, data: { members: [], applies: [], exceptions: [], exceptPairs: [], name: '' } })} className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded hover:bg-teal-200 dark:bg-teal-900 dark:text-teal-200">+ {t('add')}</button>
                        </div>
                        
                        {editingState?.type === 'markClass' && editingState.id === -1 && (
                            <EditorPanel 
                                title={t('newMarkClass')}
                                showNameInput={true}
                                nameValue={editingState.data.name}
                                onNameChange={(val) => updateEditingData('name', val)}
                                members={editingState.data.members}
                                onMembersChange={(m) => updateEditingData('members', m)}
                                applies={editingState.data.applies}
                                onAppliesChange={(m) => updateEditingData('applies', m)}
                                exceptions={editingState.data.exceptions}
                                onExceptionsChange={(m) => updateEditingData('exceptions', m)}
                                exceptPairs={editingState.data.exceptPairs}
                                onExceptPairsChange={(m) => updateEditingData('exceptPairs', m)}
                                onSave={() => handleSaveClass('markClass', -1, editingState.data)}
                                onCancel={() => setEditingState(null)}
                                characterSets={characterSets}
                                groups={groups}
                            />
                        )}

                        <div className="space-y-3">
                            {markClasses.map((cls, idx) => (
                                (editingState?.type === 'markClass' && editingState.id === idx) ? (
                                    <EditorPanel 
                                        key={`edit-mc-${idx}`}
                                        title={t('editMarkClass')}
                                        showNameInput={true}
                                        nameValue={editingState.data.name}
                                        onNameChange={(val) => updateEditingData('name', val)}
                                        members={editingState.data.members}
                                        onMembersChange={(m) => updateEditingData('members', m)}
                                        applies={editingState.data.applies}
                                        onAppliesChange={(m) => updateEditingData('applies', m)}
                                        exceptions={editingState.data.exceptions}
                                        onExceptionsChange={(m) => updateEditingData('exceptions', m)}
                                        exceptPairs={editingState.data.exceptPairs}
                                        onExceptPairsChange={(m) => updateEditingData('exceptPairs', m)}
                                        onSave={() => handleSaveClass('markClass', idx, editingState.data)}
                                        onCancel={() => setEditingState(null)}
                                        characterSets={characterSets}
                                        groups={groups}
                                    />
                                ) : (
                                    <GroupCard 
                                        key={`mc-${idx}`} 
                                        title={cls.name || t('markClassPlaceholder', { index: idx + 1 })} 
                                        members={cls.members} 
                                        applies={cls.applies}
                                        exceptions={cls.exceptions}
                                        exceptPairs={cls.exceptPairs}
                                        type="class" 
                                        onDelete={() => handleDeleteClass('markClass', idx)}
                                        onEdit={() => setEditingState({ type: 'markClass', id: idx, data: cls })}
                                    />
                                )
                            ))}
                        </div>
                    </div>

                    {/* Base Classes */}
                    <div className="bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                         <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-blue-700 dark:text-blue-400">{t('baseClasses')}</h4>
                            <button onClick={() => setEditingState({ type: 'baseClass', id: -1, data: { members: [], applies: [], exceptions: [], exceptPairs: [], name: '' } })} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200">+ {t('add')}</button>
                        </div>

                         {editingState?.type === 'baseClass' && editingState.id === -1 && (
                            <EditorPanel 
                                title={t('newBaseClass')}
                                showNameInput={true}
                                nameValue={editingState.data.name}
                                onNameChange={(val) => updateEditingData('name', val)}
                                members={editingState.data.members}
                                onMembersChange={(m) => updateEditingData('members', m)}
                                applies={editingState.data.applies}
                                onAppliesChange={(m) => updateEditingData('applies', m)}
                                exceptions={editingState.data.exceptions}
                                onExceptionsChange={(m) => updateEditingData('exceptions', m)}
                                exceptPairs={editingState.data.exceptPairs}
                                onExceptPairsChange={(m) => updateEditingData('exceptPairs', m)}
                                onSave={() => handleSaveClass('baseClass', -1, editingState.data)}
                                onCancel={() => setEditingState(null)}
                                characterSets={characterSets}
                                groups={groups}
                            />
                        )}

                         <div className="space-y-3">
                            {baseClasses.map((cls, idx) => (
                                (editingState?.type === 'baseClass' && editingState.id === idx) ? (
                                    <EditorPanel 
                                        key={`edit-bc-${idx}`}
                                        title={t('editBaseClass')}
                                        showNameInput={true}
                                        nameValue={editingState.data.name}
                                        onNameChange={(val) => updateEditingData('name', val)}
                                        members={editingState.data.members}
                                        onMembersChange={(m) => updateEditingData('members', m)}
                                        applies={editingState.data.applies}
                                        onAppliesChange={(m) => updateEditingData('applies', m)}
                                        exceptions={editingState.data.exceptions}
                                        onExceptionsChange={(m) => updateEditingData('exceptions', m)}
                                        exceptPairs={editingState.data.exceptPairs}
                                        onExceptPairsChange={(m) => updateEditingData('exceptPairs', m)}
                                        onSave={() => handleSaveClass('baseClass', idx, editingState.data)}
                                        onCancel={() => setEditingState(null)}
                                        characterSets={characterSets}
                                        groups={groups}
                                    />
                                ) : (
                                    <GroupCard 
                                        key={`bc-${idx}`} 
                                        title={cls.name || t('baseClassPlaceholder', { index: idx + 1 })} 
                                        members={cls.members}
                                        applies={cls.applies}
                                        exceptions={cls.exceptions}
                                        exceptPairs={cls.exceptPairs}
                                        type="class" 
                                        onDelete={() => handleDeleteClass('baseClass', idx)}
                                        onEdit={() => setEditingState({ type: 'baseClass', id: idx, data: cls })}
                                    />
                                )
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default React.memo(GroupManager);
