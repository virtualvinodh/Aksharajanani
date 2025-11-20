import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import TagInput from '../scriptcreator/TagInput';
import { CharacterSet } from '../../types';

interface GroupEditorProps {
    onSave: (data: { originalKey?: string, newKey: string, members: string[] }) => void;
    onCancel: () => void;
    initialData?: { key: string, members: string[] };
    isNew: boolean;
    existingKeys: string[];
    characterSets: CharacterSet[];
}

const GroupEditor: React.FC<GroupEditorProps> = ({ onSave, onCancel, initialData, isNew, existingKeys, characterSets }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [key, setKey] = useState(initialData?.key || '');
    const [members, setMembers] = useState(initialData?.members || []);
    const availableSets = characterSets.map(cs => `$${cs.nameKey}`);

    const handleSave = () => {
        const newKey = key.trim();
        if (!newKey) {
            showNotification('Group name cannot be empty.', 'error');
            return;
        }
        if (newKey.startsWith('$')) {
             showNotification('Group name should not start with $.', 'error');
             return;
        }
        if ((isNew || newKey !== initialData?.key) && existingKeys.includes(newKey)) {
            showNotification('A group with this name already exists.', 'error');
            return;
        }
        onSave({ originalKey: initialData?.key, newKey, members });
    };

    return (
        <div className="p-4 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 space-y-4">
            <div>
                <label className="font-semibold text-sm flex items-center gap-2">{t('groupName')} <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">@{key || '...'}</span></label>
                <input
                    type="text"
                    value={key}
                    onChange={e => setKey(e.target.value.replace(/\s+/g, '_'))}
                    placeholder="e.g., virama"
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 mt-1"
                />
            </div>
            <div>
                <label className="font-semibold text-sm">{t('members')}</label>
                <TagInput tags={members} setTags={setMembers} placeholder="Add glyph name or $set..." availableSets={availableSets} />
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{t('save')}</button>
            </div>
        </div>
    );
};

export default React.memo(GroupEditor);
