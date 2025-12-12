
import React, { useState } from 'react';
import { RecommendedKerning, CharacterSet } from '../../../types';
import { useLocale } from '../../../contexts/LocaleContext';
import { AddIcon, TrashIcon } from '../../../constants';
import SmartGlyphInput from './SmartGlyphInput';

interface KerningManagerProps {
    kerning: RecommendedKerning[];
    setKerning: (kerning: RecommendedKerning[]) => void;
    groups: Record<string, string[]>;
    characterSets: CharacterSet[];
}

const KerningManager: React.FC<KerningManagerProps> = ({ kerning, setKerning, groups, characterSets }) => {
    const { t } = useLocale();
    const [left, setLeft] = useState('');
    const [right, setRight] = useState('');
    const [dist, setDist] = useState('');

    const handleAdd = () => {
        if (left && right) {
            const newPair: RecommendedKerning = dist ? [left, right, dist] : [left, right];
            setKerning([...kerning, newPair]);
            setLeft(''); setRight(''); setDist('');
        }
    };

    const handleDelete = (index: number) => {
        setKerning(kerning.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-6">
             <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-gray-800 dark:text-white">{t('addSpacingPair')}</h3>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[140px]">
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('left')}</label>
                        <SmartGlyphInput value={left} onChange={setLeft} characterSets={characterSets} groups={groups} placeholder="e.g. T" />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('right')}</label>
                        <SmartGlyphInput value={right} onChange={setRight} characterSets={characterSets} groups={groups} placeholder="e.g. o" />
                    </div>
                    <div className="w-24">
                         <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{t('valueOpt')}</label>
                         <input type="text" value={dist} onChange={e => setDist(e.target.value)} placeholder="0" className="w-full p-2 border rounded dark:bg-gray-900 dark:border-gray-600 text-sm" />
                    </div>
                    <button onClick={handleAdd} disabled={!left || !right} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                        <AddIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold mb-3 text-gray-800 dark:text-white">{t('recommendedPairs')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {kerning.map((pair, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg group">
                            <div className="flex items-center gap-3">
                                <div className="flex font-mono text-sm bg-gray-100 dark:bg-gray-700 rounded px-2 py-1">
                                    <span>{pair[0]}</span>
                                    <span className="mx-2 text-gray-400">|</span>
                                    <span>{pair[1]}</span>
                                </div>
                                {pair[2] && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold">{pair[2]}</span>}
                            </div>
                            <button onClick={() => handleDelete(index)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
                {kerning.length === 0 && <p className="text-center text-gray-400 py-8 italic">{t('noPairsDefined')}</p>}
            </div>
        </div>
    );
};

export default React.memo(KerningManager);
