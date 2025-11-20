
import React, { useState, useMemo } from 'react';
import { RecommendedKerning, MarkAttachmentRules, PositioningRules, AttachmentClass, CharacterSet, AttachmentPoint } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, TrashIcon, EditIcon, SaveIcon, ClearIcon } from '../../constants';
import TagInput from './TagInput';
import GlyphSelect from './GlyphSelect';

// Props for the main pane
interface PositioningPaneProps {
    kerning: RecommendedKerning[];
    setKerning: React.Dispatch<React.SetStateAction<RecommendedKerning[]>>;
    attachment: MarkAttachmentRules;
    setAttachment: React.Dispatch<React.SetStateAction<MarkAttachmentRules>>;
    positioningRules: PositioningRules[];
    setPositioningRules: React.Dispatch<React.SetStateAction<PositioningRules[]>>;
    markAttachmentClasses: AttachmentClass[];
    setMarkAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[]>>;
    baseAttachmentClasses: AttachmentClass[];
    setBaseAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[]>>;
    groups: Record<string, string[]>;
    characterSets: CharacterSet[];
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode, initialOpen?: boolean }> = ({ title, children, initialOpen = false }) => (
    <details className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow group" open={initialOpen}>
        <summary className="text-lg font-bold cursor-pointer list-outside">{title}</summary>
        <div className="mt-4 space-y-4">
            {children}
        </div>
    </details>
);

// --- Editor Components ---

const PositioningRuleEditor: React.FC<{
    rule?: PositioningRules;
    onSave: (rule: PositioningRules) => void;
    onCancel: () => void;
    groups: Record<string, string[]>;
    characterSets: CharacterSet[];
}> = ({ rule, onSave, onCancel, groups, characterSets }) => {
    const { t } = useLocale();
    const [base, setBase] = useState<string[]>(rule?.base || []);
    const [mark, setMark] = useState<string[]>(rule?.mark || []);
    const [gpos, setGpos] = useState(rule?.gpos || '');
    const [gsub, setGsub] = useState(rule?.gsub || '');
    const [movement, setMovement] = useState(rule?.movement || 'none');
    const [ligatureMap, setLigatureMap] = useState(rule?.ligatureMap || {});

    const handleLigatureMapChange = (baseName: string, markName: string, ligName: string) => {
        setLigatureMap(prev => {
            const newMap = JSON.parse(JSON.stringify(prev));
            if (!newMap[baseName]) newMap[baseName] = {};
            if (ligName.trim()) {
                newMap[baseName][markName] = ligName.trim();
            } else {
                delete newMap[baseName][markName];
                if (Object.keys(newMap[baseName]).length === 0) delete newMap[baseName];
            }
            return newMap;
        });
    };

    const handleSave = () => {
        const finalRule: PositioningRules = { base, mark };
        if (gpos) finalRule.gpos = gpos;
        if (gsub) finalRule.gsub = gsub;
        if (movement !== 'none') finalRule.movement = movement as 'horizontal' | 'vertical';
        if (Object.keys(ligatureMap).length > 0) finalRule.ligatureMap = ligatureMap;
        onSave(finalRule);
    };
    
    const availableSets = [...characterSets.map(cs => `$${cs.nameKey}`), ...Object.keys(groups).map(g => `$${g}`)];

    return (
        <div className="p-4 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 space-y-4">
            <div><label className="font-semibold text-sm">{t('baseGlyphs')}</label><TagInput tags={base} setTags={setBase} placeholder="Add base glyph or $set..." availableSets={availableSets}/></div>
            <div><label className="font-semibold text-sm">{t('markGlyphs')}</label><TagInput tags={mark} setTags={setMark} placeholder="Add mark glyph or $set..." availableSets={availableSets}/></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder={t('gposFeatureTag')} value={gpos} onChange={e => setGpos(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                <input type="text" placeholder={t('gsubFeatureTag')} value={gsub} onChange={e => setGsub(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                 <div>
                    <select value={movement} onChange={e => setMovement(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 h-full">
                        <option value="none">{t('movementNone')}</option>
                        <option value="horizontal">{t('movementHorizontal')}</option>
                        <option value="vertical">{t('movementVertical')}</option>
                    </select>
                </div>
            </div>
            {(base.length > 0 && mark.length > 0 && gsub) && (
                <details className="p-2 border-t dark:border-gray-600">
                    <summary className="cursor-pointer text-sm font-semibold">{t('ligatureOverrides')}</summary>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                        {base.map(baseName => (
                            <div key={baseName} className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
                                <p className="font-bold text-xs mb-1">{baseName}</p>
                                {mark.map(markName => (
                                    <div key={markName} className="flex items-center gap-2 text-sm">
                                        <span>{markName} →</span>
                                        <input
                                            type="text"
                                            placeholder={`${baseName}${markName}`}
                                            value={ligatureMap[baseName]?.[markName] || ''}
                                            onChange={e => handleLigatureMapChange(baseName, markName, e.target.value)}
                                            className="w-32 p-1 border rounded dark:bg-gray-800 dark:border-gray-600 text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </details>
            )}
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{t('save')}</button>
            </div>
        </div>
    );
};

const GlyphTagInput: React.FC<{
    tags: string[];
    setTags: (tags: string[]) => void;
    placeholder: string;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ tags, setTags, placeholder, characterSets, groups }) => {
    const { t } = useLocale();
    const [selectedValue, setSelectedValue] = useState('');

    const handleAddTag = () => {
        if (selectedValue && !tags.includes(selectedValue)) {
            setTags([...tags, selectedValue]);
        }
        setSelectedValue(''); // Reset dropdown
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-white dark:bg-gray-700 dark:border-gray-600 mb-2">
                {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-semibold px-2 py-1 rounded">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                           <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <GlyphSelect
                    characterSets={characterSets}
                    value={selectedValue}
                    onChange={setSelectedValue}
                    label={placeholder}
                    className="flex-grow"
                    groups={groups}
                />
                <button type="button" onClick={handleAddTag} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                    <AddIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

const AttachmentClassEditor: React.FC<{
    classItem: Partial<AttachmentClass>;
    onSave: (newItem: AttachmentClass) => void;
    onCancel: () => void;
    type: 'base' | 'mark';
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ classItem, onSave, onCancel, type, characterSets, groups }) => {
    const { t } = useLocale();
    const [members, setMembers] = useState(classItem.members || []);
    const [applies, setApplies] = useState(classItem.applies || []);
    const [exceptions, setExceptions] = useState(classItem.exceptions || []);

    const handleSave = () => {
        onSave({
            members,
            ...(applies.length > 0 && { applies }),
            ...(exceptions.length > 0 && { exceptions }),
        });
    };
    
    const filterLabel = type === 'base' ? t('marks') : t('bases');

    return (
        <div className="p-4 border rounded-lg bg-indigo-50 dark:bg-indigo-900/20 space-y-4">
            <GlyphTagInput tags={members} setTags={setMembers} placeholder={t('members')} characterSets={characterSets} groups={groups} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 p-2 border rounded-md dark:border-gray-600">
                    <h5 className="font-semibold">{t('appliesToFilter')}</h5>
                    <GlyphTagInput tags={applies} setTags={setApplies} placeholder={filterLabel} characterSets={characterSets} groups={groups}/>
                </div>
                 <div className="space-y-2 p-2 border rounded-md dark:border-gray-600">
                    <h5 className="font-semibold">{t('exceptionsFilter')}</h5>
                    <GlyphTagInput tags={exceptions} setTags={setExceptions} placeholder={filterLabel} characterSets={characterSets} groups={groups}/>
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded">{t('cancel')}</button>
                <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">{t('save')}</button>
            </div>
        </div>
    );
};

const attachmentPoints: AttachmentPoint[] = [
    'topLeft', 'topCenter', 'topRight', 
    'midLeft', 'midRight', 
    'bottomLeft', 'bottomCenter', 'bottomRight'
];

const ManualAttachmentForm: React.FC<{onAdd: (base: string, mark: string, rule: [AttachmentPoint, AttachmentPoint] | [AttachmentPoint, AttachmentPoint, string, string]) => void, characterSets: CharacterSet[], groups: Record<string, string[]>}> = ({ onAdd, characterSets, groups }) => {
    const { t } = useLocale();
    const [base, setBase] = useState('');
    const [mark, setMark] = useState('');
    const [basePoint, setBasePoint] = useState<AttachmentPoint>('topRight');
    const [markPoint, setMarkPoint] = useState<AttachmentPoint>('topLeft');
    const [xOffset, setXOffset] = useState('');
    const [yOffset, setYOffset] = useState('');

    const handleAdd = () => {
        if (base && mark) {
            let rule: [AttachmentPoint, AttachmentPoint] | [AttachmentPoint, AttachmentPoint, string, string] = [basePoint, markPoint];
            if (xOffset.trim() || yOffset.trim()) {
                rule = [basePoint, markPoint, xOffset.trim() || '0', yOffset.trim() || '0'];
            }
            onAdd(base, mark, rule);
            setBase(''); setMark(''); setXOffset(''); setYOffset('');
        }
    }

    return (
        <div className="p-2 border-t dark:border-gray-700 flex items-end gap-2 flex-wrap">
            <div className="flex-grow"><label className="text-xs">{t('baseChar')}</label><GlyphSelect characterSets={characterSets} value={base} onChange={setBase} label={t('baseChar')} groups={groups} /></div>
            <div className="flex-grow"><label className="text-xs">{t('markChar')}</label><GlyphSelect characterSets={characterSets} value={mark} onChange={setMark} label={t('markChar')} groups={groups} /></div>
            
            <div className="flex-grow"><label className="text-xs">{t('basePoint')}</label><select value={basePoint} onChange={e => setBasePoint(e.target.value as AttachmentPoint)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">{attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="self-center pt-5 text-lg font-bold text-gray-400 dark:text-gray-500">→</div>
            <div className="flex-grow"><label className="text-xs">{t('markPoint')}</label><select value={markPoint} onChange={e => setMarkPoint(e.target.value as AttachmentPoint)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">{attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div className="flex items-center gap-1 pt-5">
                <input type="number" value={xOffset} onChange={e => setXOffset(e.target.value)} placeholder="x" className="w-14 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                <input type="number" value={yOffset} onChange={e => setYOffset(e.target.value)} placeholder="y" className="w-14 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
            </div>
            
            <button onClick={handleAdd} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"><AddIcon className="w-5 h-5"/></button>
        </div>
    );
};

const KerningForm: React.FC<{onAdd: (left: string, right: string, distance?: string|number) => void, characterSets: CharacterSet[], groups: Record<string, string[]>}> = ({ onAdd, characterSets, groups }) => {
    const { t } = useLocale();
    const [left, setLeft] = useState('');
    const [right, setRight] = useState('');
    const [distance, setDistance] = useState('');

    const handleAdd = () => {
        if(left && right) {
            onAdd(left, right, distance.trim() ? distance : undefined);
            setLeft(''); setRight(''); setDistance('');
        }
    }
    
    return (
        <div className="p-2 border-t dark:border-gray-700 flex items-end gap-2 flex-wrap">
            <div className="flex-grow"><label className="text-xs">{t('leftChar')}</label><GlyphSelect characterSets={characterSets} value={left} onChange={setLeft} label={t('leftChar')} groups={groups} /></div>
            <div className="flex-grow"><label className="text-xs">{t('rightChar')}</label><GlyphSelect characterSets={characterSets} value={right} onChange={setRight} label={t('rightChar')} groups={groups} /></div>
            <div className="w-28"><label className="text-xs">Distance</label><input type="text" value={distance} onChange={e => setDistance(e.target.value)} placeholder="e.g., 0 or lsb" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div>
            <button onClick={handleAdd} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"><AddIcon className="w-5 h-5"/></button>
        </div>
    );
};

const KerningPairEditor: React.FC<{
    pair: RecommendedKerning;
    onSave: (updatedPair: RecommendedKerning) => void;
    onCancel: () => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ pair, onSave, onCancel, characterSets, groups }) => {
    const { t } = useLocale();
    const [editedPair, setEditedPair] = useState<[string, string, string | number] | [string, string]>([...pair]);

    const handleSaveClick = () => {
        const finalPair = [...editedPair] as any;
        if (finalPair.length > 2 && (finalPair[2] === null || String(finalPair[2]).trim() === '')) {
            finalPair.pop();
        }
        onSave(finalPair);
    };
    
    return (
        <div className="p-2 border rounded-md flex flex-wrap justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 gap-2">
            <div className="flex-grow min-w-[120px]"><GlyphSelect characterSets={characterSets} value={editedPair[0]} onChange={val => setEditedPair(p => [val, p[1], p[2] as any])} label={t('leftChar')} groups={groups} /></div>
            <div className="flex-grow min-w-[120px]"><GlyphSelect characterSets={characterSets} value={editedPair[1]} onChange={val => setEditedPair(p => [p[0], val, p[2] as any])} label={t('rightChar')} groups={groups} /></div>
            <div className="w-28"><input type="text" value={editedPair[2] ?? ''} onChange={e => setEditedPair(p => [p[0], p[1], e.target.value])} placeholder="dist (opt.)" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/></div>
            <div className="flex gap-1">
                <button onClick={handleSaveClick} className="p-2 text-green-500 rounded-full hover:bg-green-100 dark:hover:bg-green-900/50" title={t('save')}><SaveIcon /></button>
                <button onClick={onCancel} className="px-3 py-1 bg-gray-500 text-white rounded text-sm">{t('cancel')}</button>
            </div>
        </div>
    );
};

const CancelIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);


// --- Main Component ---

const PositioningPane: React.FC<PositioningPaneProps> = ({
    kerning, setKerning, attachment, setAttachment,
    positioningRules, setPositioningRules,
    markAttachmentClasses, setMarkAttachmentClasses,
    baseAttachmentClasses, setBaseAttachmentClasses,
    groups,
    characterSets
}) => {
    const { t } = useLocale();
    
    const [editingRule, setEditingRule] = useState<number | null>(null);
    const [addingRule, setAddingRule] = useState(false);
    const [editingBaseClass, setEditingBaseClass] = useState<number | null>(null);
    const [addingBaseClass, setAddingBaseClass] = useState(false);
    const [editingMarkClass, setEditingMarkClass] = useState<number | null>(null);
    const [addingMarkClass, setAddingMarkClass] = useState(false);
    const [editingKerningIndex, setEditingKerningIndex] = useState<number | null>(null);
    const [editingAttachment, setEditingAttachment] = useState<{ base: string, mark: string } | null>(null);
    const [editedAttachmentData, setEditedAttachmentData] = useState<{ basePoint: AttachmentPoint, markPoint: AttachmentPoint, xOffset: string, yOffset: string }>({ basePoint: 'topRight', markPoint: 'topLeft', xOffset: '', yOffset: '' });


    const flatAttachmentRules = useMemo(() => {
        return Object.entries(attachment).flatMap(([base, marks]) =>
            Object.entries(marks).map(([mark, rule]) => ({ base, mark, rule }))
        );
    }, [attachment]);

    const handleSaveRule = (rule: PositioningRules) => {
        if (editingRule !== null) {
            setPositioningRules(prev => prev.map((item, i) => i === editingRule ? rule : item));
            setEditingRule(null);
        } else {
            setPositioningRules(prev => [...prev, rule]);
            setAddingRule(false);
        }
    };

    const handleSaveBaseClass = (classItem: AttachmentClass) => {
        if (editingBaseClass !== null) {
            setBaseAttachmentClasses(prev => prev.map((item, i) => i === editingBaseClass ? classItem : item));
            setEditingBaseClass(null);
        } else {
            setBaseAttachmentClasses(prev => [...prev, classItem]);
            setAddingBaseClass(false);
        }
    };
    
    const handleSaveMarkClass = (classItem: AttachmentClass) => {
        if (editingMarkClass !== null) {
            setMarkAttachmentClasses(prev => prev.map((item, i) => i === editingMarkClass ? classItem : item));
            setEditingMarkClass(null);
        } else {
            setMarkAttachmentClasses(prev => [...prev, classItem]);
            setAddingMarkClass(false);
        }
    };

    const handleAddKerning = (left: string, right: string, distance?: string|number) => {
      const newPair: RecommendedKerning = distance !== undefined ? [left, right, distance] : [left, right];
      setKerning(prev => [...prev, newPair]);
    };
    
    const handleSaveKerning = (index: number, updatedPair: RecommendedKerning) => {
        setKerning(prev => prev.map((item, i) => (i === index ? updatedPair : item)));
        setEditingKerningIndex(null);
    };

    const handleAddAttachment = (base: string, mark: string, rule: [AttachmentPoint, AttachmentPoint] | [AttachmentPoint, AttachmentPoint, string, string]) => {
      setAttachment(prev => ({ ...prev, [base]: { ...(prev[base] || {}), [mark]: rule } }));
    };
    
    const handleSaveAttachment = () => {
        if (!editingAttachment || !editedAttachmentData) return;
        const { base, mark } = editingAttachment;
        const { basePoint, markPoint, xOffset, yOffset } = editedAttachmentData;
    
        let newRule: [AttachmentPoint, AttachmentPoint] | [AttachmentPoint, AttachmentPoint, string, string] = [basePoint, markPoint];
        if ((xOffset && xOffset.trim() !== '') || (yOffset && yOffset.trim() !== '')) {
            newRule = [basePoint, markPoint, xOffset.trim() || '0', yOffset.trim() || '0'];
        }
        
        setAttachment(prev => {
            const newAttachment = JSON.parse(JSON.stringify(prev));
            if (!newAttachment[base]) newAttachment[base] = {};
            newAttachment[base][mark] = newRule;
            return newAttachment;
        });
    
        setEditingAttachment(null);
    };

    const renderClassItem = (item: AttachmentClass, type: 'base' | 'mark') => (
        <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap"><strong className="font-semibold text-sm">{t('members')}:</strong>{item.members.map(tag => <span key={tag} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{tag}</span>)}</div>
            {item.applies && item.applies.length > 0 && (<div className="flex items-center gap-2 flex-wrap mt-1"><strong className="font-semibold text-sm">{t('appliesToFilter')}:</strong><span className="text-xs text-gray-500">({type === 'base' ? t('marks') : t('bases')})</span>{item.applies.map(tag => <span key={tag} className="bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded text-xs">{tag}</span>)}</div>)}
            {item.exceptions && item.exceptions.length > 0 && (<div className="flex items-center gap-2 flex-wrap mt-1"><strong className="font-semibold text-sm">{t('exceptionsFilter')}:</strong><span className="text-xs text-gray-500">({type === 'base' ? t('marks') : t('bases')})</span>{item.exceptions.map(tag => <span key={tag} className="bg-yellow-100 dark:bg-yellow-900/50 px-2 py-0.5 rounded text-xs">{tag}</span>)}</div>)}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('positioningTabDescription')}</h3></div>
            
            <CollapsibleSection title={t('positioningRules')}>
                {positioningRules.map((rule, index) => (
                    editingRule === index ? (
                        <PositioningRuleEditor key={index} rule={rule} onSave={handleSaveRule} onCancel={() => setEditingRule(null)} groups={groups} characterSets={characterSets} />
                    ) : (
                    <div key={index} className="p-2 border rounded-md dark:border-gray-600"><div className="flex justify-between items-start"><div className="flex-grow space-y-1"><div className="flex items-center gap-2 flex-wrap"><strong className="font-semibold text-sm">{t('baseGlyphs')}:</strong>{rule.base.map(t => <span key={t} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{t}</span>)}</div><div className="flex items-center gap-2 flex-wrap"><strong className="font-semibold text-sm">{t('markGlyphs')}:</strong>{rule.mark.map(t => <span key={t} className="bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">{t}</span>)}</div><div className="flex items-center gap-4 text-xs font-mono">{rule.gpos && <span>GPOS: <span className="bg-teal-100 dark:bg-teal-900 px-2 py-0.5 rounded">{rule.gpos}</span></span>}{rule.gsub && <span>GSUB: <span className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">{rule.gsub}</span></span>}{rule.movement && <span>Movement: <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">{rule.movement}</span></span>}</div>{rule.ligatureMap && (<details className="text-xs pt-1"><summary className="cursor-pointer">{t('ligatureOverrides')}</summary><div className="p-2 mt-1 bg-gray-100 dark:bg-gray-700/50 rounded">{Object.entries(rule.ligatureMap).map(([base, marks]) => Object.entries(marks).map(([mark, lig]) => (<p key={`${base}-${mark}`}>{base} + {mark} → {lig}</p>)))}</div></details>)}</div><div className="flex gap-1 flex-shrink-0"><button onClick={() => setEditingRule(index)} className="p-1 text-gray-500 hover:text-indigo-500"><EditIcon /></button><button onClick={() => setPositioningRules(p => p.filter((_, i) => i !== index))} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon /></button></div></div></div>
                )))}
                {addingRule && <PositioningRuleEditor onSave={handleSaveRule} onCancel={() => setAddingRule(false)} groups={groups} characterSets={characterSets} />}
                {!addingRule && <button onClick={() => setAddingRule(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4" /> {t('addPositioningRule')}</button>}
            </CollapsibleSection>
            
            <CollapsibleSection title={t('baseAttachmentClasses')}>
                 {baseAttachmentClasses.map((item, index) => ( editingBaseClass === index ? (
                        <AttachmentClassEditor key={index} classItem={item} onSave={handleSaveBaseClass} onCancel={() => setEditingBaseClass(null)} type="base" characterSets={characterSets} groups={groups} />
                    ) : ( <div key={index} className="p-2 border rounded-md dark:border-gray-600 flex justify-between items-start">{renderClassItem(item, 'base')}<div className="flex gap-1 flex-shrink-0"><button onClick={() => setEditingBaseClass(index)} className="p-1 text-gray-500 hover:text-indigo-500"><EditIcon/></button><button onClick={() => setBaseAttachmentClasses(p => p.filter((_,i) => i !== index))} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon/></button></div></div>) ))}
                {addingBaseClass && <AttachmentClassEditor classItem={{}} onSave={handleSaveBaseClass} onCancel={() => setAddingBaseClass(false)} type="base" characterSets={characterSets} groups={groups} />}
                {!addingBaseClass && <button onClick={() => setAddingBaseClass(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4"/> {t('addBaseClass')}</button>}
            </CollapsibleSection>

            <CollapsibleSection title={t('markAttachmentClasses')}>
                {markAttachmentClasses.map((item, index) => ( editingMarkClass === index ? (
                        <AttachmentClassEditor key={index} classItem={item} onSave={handleSaveMarkClass} onCancel={() => setEditingMarkClass(null)} type="mark" characterSets={characterSets} groups={groups} />
                    ) : ( <div key={index} className="p-2 border rounded-md dark:border-gray-600 flex justify-between items-start">{renderClassItem(item, 'mark')}<div className="flex gap-1 flex-shrink-0"><button onClick={() => setEditingMarkClass(index)} className="p-1 text-gray-500 hover:text-indigo-500"><EditIcon/></button><button onClick={() => setMarkAttachmentClasses(p => p.filter((_,i) => i !== index))} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon/></button></div></div>) ))}
                {addingMarkClass && <AttachmentClassEditor classItem={{}} onSave={handleSaveMarkClass} onCancel={() => setAddingMarkClass(false)} type="mark" characterSets={characterSets} groups={groups} />}
                {!addingMarkClass && <button onClick={() => setAddingMarkClass(true)} className="flex items-center gap-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md"><AddIcon className="w-4 h-4"/> {t('addMarkClass')}</button>}
            </CollapsibleSection>

            <CollapsibleSection title={t('markAttachmentRules')}>
                <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b dark:border-gray-600"><th className="p-2 text-left">{t('baseChar')}</th><th className="p-2 text-left">{t('markChar')}</th><th className="p-2 text-left">{t('attachmentPoint')} & Offset</th><th className="p-2 text-right">{t('actions')}</th></tr></thead>
                    <tbody>
                        {flatAttachmentRules.map(({ base, mark, rule }, index) => {
                            const isEditing = editingAttachment?.base === base && editingAttachment?.mark === mark;
                            if (isEditing) {
                                return (
                                    <tr key={`${base}-${mark}-${index}`} className="bg-indigo-50 dark:bg-indigo-900/20">
                                        <td className="p-2">{base}</td>
                                        <td className="p-2">{mark}</td>
                                        <td className="p-2">
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <select value={editedAttachmentData.basePoint} onChange={e => setEditedAttachmentData(d => ({ ...d, basePoint: e.target.value as AttachmentPoint }))} className="p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs">{attachmentPoints.map(p => <option key={`base-${p}`} value={p}>{p}</option>)}</select>
                                                <span>→</span>
                                                <select value={editedAttachmentData.markPoint} onChange={e => setEditedAttachmentData(d => ({ ...d, markPoint: e.target.value as AttachmentPoint }))} className="p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs">{attachmentPoints.map(p => <option key={`mark-${p}`} value={p}>{p}</option>)}</select>
                                                <input type="number" value={editedAttachmentData.xOffset} onChange={e => setEditedAttachmentData(d => ({ ...d, xOffset: e.target.value }))} placeholder="x" className="w-14 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs"/>
                                                <input type="number" value={editedAttachmentData.yOffset} onChange={e => setEditedAttachmentData(d => ({ ...d, yOffset: e.target.value }))} placeholder="y" className="w-14 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs"/>
                                            </div>
                                        </td>
                                        <td className="p-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={handleSaveAttachment} className="p-1 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full" title={t('save')}><SaveIcon /></button>
                                                <button onClick={() => setEditingAttachment(null)} className="p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full" title={t('cancel')}><CancelIcon /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }
                            return (
                                <tr key={`${base}-${mark}-${index}`} className="border-b dark:border-gray-700">
                                    <td className="p-2">{base}</td>
                                    <td className="p-2">{mark}</td>
                                    <td className="p-2 font-mono text-xs">{rule.join(', ')}</td>
                                    <td className="p-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => {
                                                setEditingAttachment({ base, mark });
                                                const [basePoint, markPoint, xOffset, yOffset] = rule;
                                                setEditedAttachmentData({
                                                    basePoint: basePoint as AttachmentPoint,
                                                    markPoint: markPoint as AttachmentPoint,
                                                    xOffset: xOffset || '',
                                                    yOffset: yOffset || '',
                                                });
                                            }} className="p-1 text-gray-500 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><EditIcon /></button>
                                            <button onClick={() => setAttachment(a => { const n=JSON.parse(JSON.stringify(a)); if(n[base]&&n[base][mark]){delete n[base][mark];} if(n[base]&&Object.keys(n[base]).length===0){delete n[base];} return n;})} className="p-1 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><TrashIcon/></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>
                <ManualAttachmentForm onAdd={handleAddAttachment} characterSets={characterSets} groups={groups} />
            </CollapsibleSection>

            <CollapsibleSection title={t('recommendedKerning')}>
                 <div className="flex flex-col gap-2">
                    {kerning.map((pair, index) => (
                        editingKerningIndex === index ? (
                            <KerningPairEditor
                                key={index}
                                pair={pair}
                                onSave={(updatedPair) => handleSaveKerning(index, updatedPair)}
                                onCancel={() => setEditingKerningIndex(null)}
                                characterSets={characterSets}
                                groups={groups}
                            />
                        ) : (
                            <div key={index} className="p-2 border rounded-md flex justify-between items-center dark:border-gray-600">
                                <span className="font-mono">{pair.join(', ')}</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setEditingKerningIndex(index)} className="p-1 text-gray-500 hover:text-indigo-500 rounded-full"><EditIcon/></button>
                                    <button onClick={() => setKerning(k => k.filter((_, i) => i !== index))} className="p-1 text-gray-500 hover:text-red-500 rounded-full"><TrashIcon /></button>
                                </div>
                            </div>
                        )
                    ))}
                </div>
                <KerningForm onAdd={handleAddKerning} characterSets={characterSets} groups={groups} />
            </CollapsibleSection>
        </div>
    );
};

export default PositioningPane;
