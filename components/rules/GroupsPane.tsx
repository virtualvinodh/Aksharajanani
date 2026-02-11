
import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, EditIcon, TrashIcon, CloseIcon, SaveIcon } from '../../constants';
import { CharacterSet } from '../../types';
import SmartGlyphInput from './manager/SmartGlyphInput';
import { useLayout } from '../../contexts/LayoutContext';
import { sanitizeIdentifier } from '../../utils/stringUtils';
import { useProject } from '../../contexts/ProjectContext';

interface GroupsPaneProps {
    groups: Record<string, string[]>;
    onSave: (data: { originalKey?: string, newKey: string, members: string[] }) => void;
    onDelete: (key: string) => void;
    characterSets: CharacterSet[];
    hiddenGroups?: Set<string>; // Deprecated in favor of 'lockedGroups' but kept for compatibility in types if needed
}

const fontStyle = {
    fontFamily: 'var(--guide-font-family)',
    fontFeatureSettings: 'var(--guide-font-feature-settings)'
};

const GroupCard: React.FC<{
    title: string;
    members: string[];
    onDelete: () => void;
    onEdit: () => void;
    isReadOnly?: boolean;
}> = ({ title, members, onDelete, onEdit, isReadOnly = false }) => {
    const { t } = useLocale();
    
    // Visual distinction for read-only groups
    const badgeClass = isReadOnly 
        ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    
    const badgeText = isReadOnly ? "@PosGroup" : "@Group";

    return (
        <div className={`bg-white dark:bg-gray-800 border ${isReadOnly ? 'border-dashed border-gray-300 dark:border-gray-600' : 'border-gray-200 dark:border-gray-700'} rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative group`}>
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${badgeClass}`}>
                        {badgeText}
                    </span>
                    <h4 className="font-mono font-bold text-gray-800 dark:text-gray-200 text-lg">{title}</h4>
                </div>
                
                {isReadOnly ? (
                    <div className="text-gray-400 p-1.5" title="Managed in Positioning Workspace">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                        </svg>
                    </div>
                ) : (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={onEdit} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><EditIcon className="w-4 h-4" /></button>
                        <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                )}
            </div>
            
            <div className={`flex flex-wrap gap-1 mb-2 ${isReadOnly ? 'opacity-75' : ''}`}>
                {members.slice(0, 8).map((m, i) => (
                    <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded border dark:border-gray-600 font-mono" style={fontStyle}>
                        {m}
                    </span>
                ))}
                {members.length > 8 && (
                    <span className="text-xs text-gray-400 self-center">+{members.length - 8} {t('more')}</span>
                )}
            </div>
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
}> = ({ label, items, onChange, placeholder, characterSets, groups }) => {
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
                {items.map(m => (
                    <span key={m} className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 px-2 py-1 rounded text-sm font-mono group" style={fontStyle}>
                        {m}
                        <button onClick={() => onChange(items.filter(x => x !== m))} className="hover:text-red-500 ml-1">&times;</button>
                    </span>
                ))}
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
                <button onClick={addItem} className="px-4 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold">+</button>
            </div>
        </div>
    );
};

const EditorPanel: React.FC<{
    title: string;
    nameValue: string;
    onNameChange: (val: string) => void;
    members: string[];
    onMembersChange: (m: string[]) => void;
    onSave: () => void;
    onCancel: () => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ title, nameValue, onNameChange, members, onMembersChange, onSave, onCancel, characterSets, groups }) => {
    const { t } = useLocale();
    const [showHint, setShowHint] = useState(false);

    const handleNameInput = (val: string) => {
        const sanitized = sanitizeIdentifier(val);
        if (val.length > 0 && sanitized !== val.replace(/[\s-]+/g, '_')) {
            setShowHint(true);
        } else {
            setShowHint(false);
        }
        onNameChange(sanitized);
    };

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 animate-fade-in-up col-span-full relative z-30">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><CloseIcon /></button>
            </div>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('glyphName')}</label>
                    <div className="flex items-center gap-2">
                            <span className="text-gray-400 font-mono text-lg">@</span>
                            <input 
                                type="text" 
                                value={nameValue} 
                                onChange={e => handleNameInput(e.target.value)} 
                                className={`flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono ${showHint ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}
                                placeholder="group_name"
                                autoFocus
                            />
                    </div>
                    {showHint && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium animate-fade-in-up">
                            {t('namingRestrictionHint')}
                        </p>
                    )}
                </div>
                
                <ChipInput 
                    label={t('classMembers')}
                    items={members} 
                    onChange={onMembersChange} 
                    placeholder={t('typeGlyphOrGroup')}
                    characterSets={characterSets} 
                    groups={groups} 
                />
                
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded">{t('cancel')}</button>
                    <button onClick={onSave} disabled={!nameValue.trim()} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2 disabled:bg-green-400"><SaveIcon className="w-4 h-4"/> {t('save')}</button>
                </div>
            </div>
        </div>
    );
};

const GroupsPane: React.FC<GroupsPaneProps> = ({ groups, onSave, onDelete, characterSets, hiddenGroups }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { positioningGroupNames } = useProject();
    const [editingState, setEditingState] = useState<{ id: string, key: string, members: string[] } | null>(null);

    const handleSaveGroup = () => {
        if (!editingState) return;
        const newKey = editingState.key.trim();
        if (!newKey) return;
        const lowerKey = newKey.toLowerCase();
        
        // --- GLOBAL CASE-INSENSITIVE DUPLICATE CHECK ---
        const existingCharSetKeys = characterSets.map(cs => cs.nameKey.toLowerCase());
        const positioningGroupKeys = Array.from(positioningGroupNames).map(n => n.toLowerCase());
        
        // Check conflicts unless it's a rename of self
        const isSelfRename = editingState.id.toLowerCase() === lowerKey;
        
        if (!isSelfRename) {
            if (existingCharSetKeys.includes(lowerKey)) {
                showNotification(t('errorCharSetExists'), 'error');
                return;
            }
            if (positioningGroupKeys.includes(lowerKey)) {
                showNotification(t('errorPosGroupExists'), 'error');
                return;
            }
            // Check rules group conflict
            if (Object.keys(groups).some(k => k.toLowerCase() === lowerKey)) {
                 showNotification(t('errorRuleGroupExists'), 'error');
                 return;
            }
        }

        onSave({ 
            originalKey: editingState.id === '__new__' ? undefined : editingState.id, 
            newKey: newKey, 
            members: editingState.members 
        });
        setEditingState(null);
    };

    // Use hiddenGroups as the source of "locked" groups
    const lockedGroups = hiddenGroups || new Set();
    const allGroups = Object.entries(groups);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                     <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        Manage glyph groups referenced in FEA code using an <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">@</span> prefix (e.g., <span className="font-mono text-purple-600">@consonants</span>).
                    </p>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md p-3">
                         <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                             <span>
                                <strong>Note:</strong> Groups tagged with a lock icon are managed automatically by the Positioning workspace.
                             </span>
                        </p>
                    </div>
                </div>
                {!editingState && (
                    <button 
                        onClick={() => setEditingState({ id: '__new__', key: '', members: [] })}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                    >
                        <AddIcon className="w-4 h-4" /> {t('addGroup')}
                    </button>
                )}
            </div>
            
            {editingState?.id === '__new__' && (
                <EditorPanel 
                    title={t('newGroup')}
                    nameValue={editingState.key}
                    onNameChange={(val) => setEditingState({ ...editingState, key: val })}
                    members={editingState.members}
                    onMembersChange={(m) => setEditingState({ ...editingState, members: m })}
                    onSave={handleSaveGroup}
                    onCancel={() => setEditingState(null)}
                    characterSets={characterSets}
                    groups={groups}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allGroups.map(([name, members]) => {
                    const isReadOnly = lockedGroups.has(name);

                    if (editingState?.id === name) {
                         return (
                            <EditorPanel
                                key={name}
                                title={t('editGroup')}
                                nameValue={editingState.key}
                                onNameChange={(val) => setEditingState({ ...editingState, key: val })}
                                members={editingState.members}
                                onMembersChange={(m) => setEditingState({ ...editingState, members: m })}
                                onSave={handleSaveGroup}
                                onCancel={() => setEditingState(null)}
                                characterSets={characterSets}
                                groups={groups}
                            />
                        );
                    }

                    return (
                        <GroupCard
                            key={name}
                            title={`@${name}`}
                            members={members}
                            onDelete={() => onDelete(name)}
                            onEdit={() => setEditingState({ id: name, key: name, members })}
                            isReadOnly={isReadOnly}
                        />
                    );
                })}
            </div>
            
            {allGroups.length === 0 && !editingState && (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                    <p className="text-gray-400">No groups defined yet.</p>
                </div>
            )}
        </div>
    );
};

export default React.memo(GroupsPane);
