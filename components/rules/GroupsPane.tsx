import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, EditIcon, TrashIcon } from '../../constants';
import GroupEditor from './GroupEditor';
import { CharacterSet } from '../../types';

interface GroupsPaneProps {
    groups: Record<string, string[]>;
    onSave: (data: { originalKey?: string, newKey: string, members: string[] }) => void;
    onDelete: (key: string) => void;
    characterSets: CharacterSet[];
}

const GroupsPane: React.FC<GroupsPaneProps> = ({ groups, onSave, onDelete, characterSets }) => {
    const { t } = useLocale();
    const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
    const [addingGroup, setAddingGroup] = useState(false);

    const handleSaveGroup = (data: { originalKey?: string, newKey: string, members: string[] }) => {
        onSave(data);
        setAddingGroup(false);
        setEditingGroupKey(null);
    };

    const fontStyle = {
        fontFamily: 'var(--guide-font-family)',
        fontFeatureSettings: 'var(--guide-font-feature-settings)'
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage glyph groups that can be referenced in your FEA code using an '@' prefix (e.g., @virama). Groups defined here are separate from those in positioning.json.</p>
            
            {Object.entries(groups).map(([name, members]) => (
                editingGroupKey === name ? (
                    <GroupEditor
                        key={name}
                        initialData={{ key: name, members }}
                        onSave={handleSaveGroup}
                        onCancel={() => setEditingGroupKey(null)}
                        isNew={false}
                        existingKeys={Object.keys(groups)}
                        characterSets={characterSets}
                    />
                ) : (
                    <div key={name} className="p-3 border rounded-md dark:border-gray-600 flex justify-between items-center bg-white dark:bg-gray-800">
                        <div>
                            <strong
                                className="text-indigo-600 dark:text-indigo-400"
                                style={fontStyle}
                            >
                                @{name}
                            </strong>
                            <p
                                className="text-md text-gray-500 dark:text-gray-400 break-all"
                                style={fontStyle}
                            >
                                {members.join(', ')}
                            </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => setEditingGroupKey(name)} className="p-2 text-gray-500 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><EditIcon /></button>
                            <button onClick={() => onDelete(name)} className="p-2 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><TrashIcon /></button>
                        </div>
                    </div>
                )
            ))}

            {addingGroup && (
                <GroupEditor
                    onSave={handleSaveGroup}
                    onCancel={() => setAddingGroup(false)}
                    isNew={true}
                    existingKeys={Object.keys(groups)}
                    characterSets={characterSets}
                />
            )}
            
            {!addingGroup && !editingGroupKey && (
                <button onClick={() => setAddingGroup(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                    <AddIcon className="w-5 h-5" /> {t('addGroup')}
                </button>
            )}
        </div>
    );
};

export default React.memo(GroupsPane);