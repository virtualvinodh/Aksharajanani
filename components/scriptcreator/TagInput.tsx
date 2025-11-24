import React, { useState } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon } from '../../constants';

interface TagInputProps {
    tags: string[];
    setTags: (tags: string[]) => void;
    placeholder: string;
    availableSets?: string[];
}

const TagInput: React.FC<TagInputProps> = ({ tags, setTags, placeholder, availableSets = [] }) => {
    const { t } = useLocale();
    const [inputValue, setInputValue] = useState('');

    const handleAddTag = () => {
        const newTag = inputValue.trim();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setInputValue('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag();
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-white dark:bg-gray-700 dark:border-gray-600">
                {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-semibold px-2 py-1 rounded">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                           <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="flex-grow p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                />
                <button type="button" onClick={handleAddTag} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    <AddIcon className="w-5 h-5" />
                </button>
            </div>
            {availableSets.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Available sets: <span className="font-mono">{availableSets.join(', ')}</span></p>}
        </div>
    );
};

export default TagInput;