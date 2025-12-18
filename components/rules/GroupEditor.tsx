
import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import TagInput from '../scriptcreator/TagInput';
import { CharacterSet } from '../../types';
import { useProject } from '../../contexts/ProjectContext';
import { useRules } from '../../contexts/RulesContext';
import { sanitizeIdentifier } from '../../utils/stringUtils';

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
    const { positioningGroupNames } = useProject();
    const { state: rulesState } = useRules();
    const rulesGroups = rulesState.fontRules?.groups || {};

    const [key, setKey] = useState(initialData?.key || '');
    const [members, setMembers] = useState(initialData?.members || []);
    const [showHint, setShowHint] = useState(false);
    const availableSets = characterSets.map(cs => `$${cs.nameKey}`);

    const handleNameChange = (val: string) => {
        const sanitized = sanitizeIdentifier(val);
        if (val.length > 0 && sanitized !== val.replace(/[\s-]+/g, '_')) {
            setShowHint(true);
        } else {
            setShowHint(false);
        }
        setKey(sanitized);
    };

    const handleSave = () => {
        const newKey = key.trim();
        const lowerKey = newKey.toLowerCase();
        
        if (!newKey) {
            showNotification(t('errorGroupNameRequired'), 'error');
            return;
        }
        if (newKey.startsWith('$')) {
             showNotification(t('errorGroupNoDollar'), 'error');
             return;
        }

        // --- GLOBAL CASE-INSENSITIVE DUPLICATE CHECK ---
        const existingCharSetKeys = characterSets.map(cs => cs.nameKey.toLowerCase());
        const positioningGroupKeys = Array.from(positioningGroupNames).map(n => n.toLowerCase());
        const rulesGroupKeys = Object.keys(rulesGroups).map(n => n.toLowerCase());
        
        const isSelfRename = !isNew && initialData?.key.toLowerCase() === lowerKey;
        
        if (!isSelfRename) {
            if (existingCharSetKeys.includes(lowerKey)) {
                showNotification(t('errorCharSetExists'), 'error');
                return;
            }
            if (positioningGroupKeys.includes(lowerKey)) {
                showNotification(t('errorPosGroupExists'), 'error');
                return;
            }
            if (rulesGroupKeys.includes(lowerKey)) {
                showNotification(t('errorRuleGroupExists'), 'error');
                return;
            }
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
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder="e.g., virama"
                    className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 mt-1 ${showHint ? 'border-amber-500 ring-1 ring-amber-500' : ''}`}
                />
                {showHint && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium animate-fade-in-up">
                        {t('namingRestrictionHint')}
                    </p>
                )}
            </div>
            <div>
                <label className="font-semibold text-sm">{t('members')}</label>
                <TagInput tags={members} setTags={setMembers} placeholder="Add glyph name or $set..." availableSets={availableSets} />
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} disabled={!key.trim()} className="px-3 py-1 bg-indigo-600 text-white rounded disabled:opacity-50">{t('save')}</button>
            </div>
        </div>
    );
};

export default React.memo(GroupEditor);
