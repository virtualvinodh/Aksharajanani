
import React, { useState, useMemo } from 'react';
import { MarkAttachmentRules, PositioningRules, AttachmentPoint, CharacterSet } from '../../../types';
import { useLocale } from '../../../contexts/LocaleContext';
import { AddIcon, TrashIcon, EditIcon, SaveIcon, CloseIcon } from '../../../constants';
import SmartGlyphInput from './SmartGlyphInput';

interface RuleManagerProps {
    positioningRules: PositioningRules[];
    setPositioningRules: (rules: PositioningRules[]) => void;
    markAttachment: MarkAttachmentRules;
    setMarkAttachment: (rules: MarkAttachmentRules) => void;
    groups: Record<string, string[]>;
    characterSets: CharacterSet[];
}

const Chip: React.FC<{ label: string, color?: 'purple' | 'gray' | 'teal' | 'blue' }> = ({ label, color = 'gray' }) => {
    const styles = {
        purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
        teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    };
    
    // Auto-detect group syntax
    const effectiveColor = label.startsWith('$') || label.startsWith('@') ? 'purple' : color;

    return (
        <span 
            className={`px-2 py-1 rounded text-xs font-mono font-medium ${styles[effectiveColor]}`}
            style={{
                fontFamily: 'var(--guide-font-family)',
                fontFeatureSettings: 'var(--guide-font-feature-settings)'
            }}
        >
            {label}
        </span>
    );
};

const RuleCard: React.FC<{ 
    base: string[]; 
    mark: string[]; 
    tags: { gpos?: string, gsub?: string, movement?: string };
    ligatureMap?: { [base: string]: { [mark: string]: string } };
    onEdit: () => void;
    onDelete: () => void;
}> = ({ base, mark, tags, ligatureMap, onEdit, onDelete }) => (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 group">
        <div className="flex items-start justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                    {base.map((b, i) => <Chip key={i} label={b} />)}
                </div>
                <span className="text-gray-400 font-bold">+</span>
                <div className="flex flex-wrap gap-1">
                    {mark.map((m, i) => <Chip key={i} label={m} />)}
                </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="p-1.5 text-gray-500 hover:text-indigo-600 rounded hover:bg-indigo-50"><EditIcon className="w-4 h-4" /></button>
                <button onClick={onDelete} className="p-1.5 text-gray-500 hover:text-red-600 rounded hover:bg-red-50"><TrashIcon className="w-4 h-4" /></button>
            </div>
        </div>
        
        <div className="flex flex-wrap gap-2 text-[10px] uppercase font-bold tracking-wider">
            {tags.gpos && <span className="text-teal-600 bg-teal-50 px-2 py-1 rounded border border-teal-100 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400">GPOS: {tags.gpos}</span>}
            {tags.gsub && <span className="text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400">GSUB: {tags.gsub}</span>}
            {tags.movement && <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400">{tags.movement}</span>}
            {ligatureMap && Object.keys(ligatureMap).length > 0 && (
                <span className="text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400">
                    {Object.keys(ligatureMap).length} overrides
                </span>
            )}
        </div>
    </div>
);

const ManualRuleCard: React.FC<{ 
    base: string; 
    mark: string; 
    points: { base: string, mark: string, x: string, y: string };
    onDelete: () => void;
    onEdit: () => void;
    isVirtual?: boolean;
}> = ({ base, mark, points, onDelete, onEdit, isVirtual }) => (
    <div className={`bg-white dark:bg-gray-800 border ${isVirtual ? 'border-dashed border-indigo-200 dark:border-indigo-900' : 'border-gray-200 dark:border-gray-700'} rounded-lg p-3 shadow-sm flex items-center justify-between group`}>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Chip label={base} />
                <span className="text-gray-400">→</span>
                <Chip label={mark} />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-col">
                <span>⚓ {points.base} : {points.mark}</span>
                {(points.x !== '0' || points.y !== '0') && <span>Offset: ({points.x}, {points.y})</span>}
            </div>
        </div>
        {!isVirtual && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={onEdit} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all">
                    <EditIcon className="w-4 h-4" />
                </button>
                <button onClick={onDelete} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
        )}
        {isVirtual && (
            <span className="text-[10px] text-indigo-400 italic">Expanded</span>
        )}
    </div>
);

const RuleEditor: React.FC<{
    rule?: PositioningRules;
    onSave: (rule: PositioningRules) => void;
    onCancel: () => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ rule, onSave, onCancel, characterSets, groups }) => {
    const { t } = useLocale();
    const [base, setBase] = useState<string[]>(rule?.base || []);
    const [mark, setMark] = useState<string[]>(rule?.mark || []);
    const [gpos, setGpos] = useState(rule?.gpos || '');
    const [gsub, setGsub] = useState(rule?.gsub || '');
    const [movement, setMovement] = useState(rule?.movement || 'none');
    
    // Ligature Map state (flattened for UI: {base, mark, lig})
    const [ligOverrides, setLigOverrides] = useState<{base: string, mark: string, lig: string}[]>(() => {
        const overrides: {base: string, mark: string, lig: string}[] = [];
        if (rule?.ligatureMap) {
            Object.entries(rule.ligatureMap).forEach(([b, marks]) => {
                Object.entries(marks).forEach(([m, l]) => {
                    overrides.push({ base: b, mark: m, lig: l });
                });
            });
        }
        return overrides;
    });
    
    const [newOverride, setNewOverride] = useState({ base: '', mark: '', lig: '' });

    const handleSave = () => {
        if (base.length === 0 || mark.length === 0) return;
        const newRule: PositioningRules = { base, mark };
        if (gpos) newRule.gpos = gpos;
        if (gsub) newRule.gsub = gsub;
        if (movement !== 'none') newRule.movement = movement as any;
        
        // Reconstruct ligatureMap
        if (ligOverrides.length > 0) {
            const map: { [base: string]: { [mark: string]: string } } = {};
            ligOverrides.forEach(o => {
                if (!map[o.base]) map[o.base] = {};
                map[o.base][o.mark] = o.lig;
            });
            newRule.ligatureMap = map;
        }

        onSave(newRule);
    };

    const addTag = (setter: React.Dispatch<React.SetStateAction<string[]>>, current: string[], val: string) => {
        if (val && !current.includes(val)) setter([...current, val]);
    };

    const removeTag = (setter: React.Dispatch<React.SetStateAction<string[]>>, current: string[], val: string) => {
        setter(current.filter(t => t !== val));
    };
    
    const addOverride = () => {
        if (newOverride.base && newOverride.mark && newOverride.lig) {
            setLigOverrides([...ligOverrides, newOverride]);
            setNewOverride({ base: '', mark: '', lig: '' });
        }
    };

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 animate-fade-in-up">
            <div className="flex justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">{rule ? 'Edit Rule' : 'New Positioning Rule'}</h3>
                <button onClick={onCancel}><CloseIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Base Targets</label>
                    <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                        {base.map(b => (
                            <span key={b} onClick={() => removeTag(setBase, base, b)} className="cursor-pointer hover:line-through"><Chip label={b} /></span>
                        ))}
                    </div>
                    <SmartGlyphInput value="" onChange={(v) => addTag(setBase, base, v)} characterSets={characterSets} groups={groups} placeholder="Add base..." />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Mark Targets</label>
                    <div className="flex flex-wrap gap-2 mb-2 min-h-[32px]">
                         {mark.map(m => (
                            <span key={m} onClick={() => removeTag(setMark, mark, m)} className="cursor-pointer hover:line-through"><Chip label={m} /></span>
                        ))}
                    </div>
                    <SmartGlyphInput value="" onChange={(v) => addTag(setMark, mark, v)} characterSets={characterSets} groups={groups} placeholder="Add mark..." />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">GPOS Tag</label>
                    <input type="text" value={gpos} onChange={e => setGpos(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-sm" placeholder="e.g. abvm" />
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">GSUB Tag</label>
                    <input type="text" value={gsub} onChange={e => setGsub(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-sm" placeholder="e.g. akhn" />
                </div>
                <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Movement</label>
                    <select value={movement} onChange={e => setMovement(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-sm">
                        <option value="none">None</option>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                    </select>
                </div>
            </div>
            
            <div className="border-t dark:border-gray-700 pt-4 mb-4">
                 <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Ligature Naming Overrides (Optional)</h4>
                 <div className="space-y-2">
                     {ligOverrides.map((o, idx) => (
                         <div key={idx} className="flex items-center gap-2 text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">
                             <span className="font-mono">{o.base} + {o.mark} → {o.lig}</span>
                             <button onClick={() => setLigOverrides(ligOverrides.filter((_, i) => i !== idx))} className="ml-auto text-red-500">&times;</button>
                         </div>
                     ))}
                     <div className="flex gap-2 items-end">
                         <div className="flex-1">
                             <label className="text-[10px] uppercase text-gray-400">Base</label>
                             <SmartGlyphInput value={newOverride.base} onChange={v => setNewOverride({...newOverride, base: v})} characterSets={characterSets} groups={groups} placeholder="Base" />
                         </div>
                         <span className="pb-2 text-gray-400">+</span>
                         <div className="flex-1">
                             <label className="text-[10px] uppercase text-gray-400">Mark</label>
                             <SmartGlyphInput value={newOverride.mark} onChange={v => setNewOverride({...newOverride, mark: v})} characterSets={characterSets} groups={groups} placeholder="Mark" />
                         </div>
                         <span className="pb-2 text-gray-400">→</span>
                         <div className="flex-1">
                             <label className="text-[10px] uppercase text-gray-400">Ligature Name</label>
                             <input type="text" value={newOverride.lig} onChange={e => setNewOverride({...newOverride, lig: e.target.value})} className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-600 text-sm" placeholder="my_ligature" />
                         </div>
                         <button onClick={addOverride} className="px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm">Add</button>
                     </div>
                 </div>
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-2"><SaveIcon className="w-4 h-4"/> Save Rule</button>
            </div>
        </div>
    );
};

const ManualAnchorForm: React.FC<{
    onSave: (data: { base: string, mark: string, basePoint: string, markPoint: string, x: string, y: string }) => void;
    onCancel: () => void;
    initialValues?: { base: string, mark: string, basePoint: string, markPoint: string, x: string, y: string };
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
}> = ({ onSave, onCancel, initialValues, characterSets, groups }) => {
    const [base, setBase] = useState(initialValues?.base || '');
    const [mark, setMark] = useState(initialValues?.mark || '');
    const [basePoint, setBasePoint] = useState<AttachmentPoint>((initialValues?.basePoint as AttachmentPoint) || 'topRight');
    const [markPoint, setMarkPoint] = useState<AttachmentPoint>((initialValues?.markPoint as AttachmentPoint) || 'topLeft');
    const [x, setX] = useState(initialValues?.x || '0');
    const [y, setY] = useState(initialValues?.y || '0');
    
    const attachmentPoints: AttachmentPoint[] = [
        'topLeft', 'topCenter', 'topRight', 
        'midLeft', 'midRight', 
        'bottomLeft', 'bottomCenter', 'bottomRight'
    ];

    const handleSubmit = () => {
        if (base && mark) {
            onSave({ base, mark, basePoint, markPoint, x, y });
        }
    };

    const isEditing = !!initialValues;

    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex flex-col gap-3 animate-fade-in-up">
             <div className="flex justify-between items-center mb-2">
                 <h4 className="font-bold text-gray-800 dark:text-white text-sm">{isEditing ? 'Edit Anchor' : 'New Anchor'}</h4>
                 <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><CloseIcon className="w-4 h-4" /></button>
             </div>
             <div className="flex gap-4">
                 <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Base</label>
                     <SmartGlyphInput value={base} onChange={setBase} characterSets={characterSets} groups={groups} placeholder="Base glyph..." />
                 </div>
                 <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Mark</label>
                     <SmartGlyphInput value={mark} onChange={setMark} characterSets={characterSets} groups={groups} placeholder="Mark glyph..." />
                 </div>
             </div>
             <div className="flex gap-2 items-end">
                  <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Base Point</label>
                     <select value={basePoint} onChange={e => setBasePoint(e.target.value as any)} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 text-sm">
                         {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                  </div>
                  <span className="pb-2 text-gray-400">→</span>
                  <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Mark Point</label>
                     <select value={markPoint} onChange={e => setMarkPoint(e.target.value as any)} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 text-sm">
                         {attachmentPoints.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                  </div>
                  <div className="w-20">
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">X Offset</label>
                      <input type="number" value={x} onChange={e => setX(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 text-sm" />
                  </div>
                  <div className="w-20">
                      <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Y Offset</label>
                      <input type="number" value={y} onChange={e => setY(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 text-sm" />
                  </div>
                  <button onClick={handleSubmit} disabled={!base || !mark} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold">
                      {isEditing ? 'Save' : 'Add'}
                  </button>
             </div>
        </div>
    );
};

const RuleManager: React.FC<RuleManagerProps> = ({
    positioningRules, setPositioningRules, markAttachment, setMarkAttachment, groups, characterSets
}) => {
    const { t } = useLocale();
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    
    // Anchor specific states
    const [isAddingAnchor, setIsAddingAnchor] = useState(false);
    const [editingAnchor, setEditingAnchor] = useState<{ base: string, mark: string } | null>(null);

    // Rule Handlers
    const handleSaveRule = (rule: PositioningRules) => {
        if (editingIndex !== null) {
            const newRules = [...positioningRules];
            newRules[editingIndex] = rule;
            setPositioningRules(newRules);
            setEditingIndex(null);
        } else {
            setPositioningRules([...positioningRules, rule]);
            setIsAdding(false);
        }
    };

    const handleDeleteRule = (index: number) => {
        setPositioningRules(positioningRules.filter((_, i) => i !== index));
    };
    
    // Anchor Handlers
    const handleSaveAnchor = (data: { base: string, mark: string, basePoint: string, markPoint: string, x: string, y: string }) => {
        const newAttachment = { ...markAttachment };
        
        // If editing and key changed, delete old one
        if (editingAnchor && (editingAnchor.base !== data.base || editingAnchor.mark !== data.mark)) {
             if (newAttachment[editingAnchor.base]) {
                delete newAttachment[editingAnchor.base][editingAnchor.mark];
                if (Object.keys(newAttachment[editingAnchor.base]).length === 0) delete newAttachment[editingAnchor.base];
             }
        }

        if (!newAttachment[data.base]) newAttachment[data.base] = {};
        newAttachment[data.base][data.mark] = [data.basePoint as any, data.markPoint as any, data.x, data.y];
        
        setMarkAttachment(newAttachment);
        setIsAddingAnchor(false);
        setEditingAnchor(null);
    };

    const handleDeleteAttachment = (base: string, mark: string, isVirtual?: boolean) => {
        if (isVirtual) return;
        const newAttachment = { ...markAttachment };
        if (newAttachment[base]) {
            delete newAttachment[base][mark];
            if (Object.keys(newAttachment[base]).length === 0) delete newAttachment[base];
            setMarkAttachment(newAttachment);
        }
    };

    const visibleAttachments = useMemo(() => {
        // Return raw attachments directly
        return Object.entries(markAttachment).flatMap(([base, marks]) => 
            Object.entries(marks).map(([mark, rule]) => ({ base, mark, rule, isVirtual: false }))
        );
    }, [markAttachment]);


    return (
        <div className="space-y-8">
            <section>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">Feature Rules (GPOS/GSUB)</h3>
                        <p className="text-sm text-gray-500">Define positioning logic for base-mark combinations.</p>
                    </div>
                    {!isAdding && !editingIndex && (
                        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                            <AddIcon className="w-4 h-4" /> Add Rule
                        </button>
                    )}
                </div>

                {isAdding && <RuleEditor onSave={handleSaveRule} onCancel={() => setIsAdding(false)} characterSets={characterSets} groups={groups} />}
                {editingIndex !== null && <RuleEditor rule={positioningRules[editingIndex]} onSave={handleSaveRule} onCancel={() => setEditingIndex(null)} characterSets={characterSets} groups={groups} />}

                <div className="space-y-3">
                    {positioningRules.map((rule, index) => (
                        <RuleCard 
                            key={index} 
                            base={rule.base} 
                            mark={rule.mark || []} 
                            tags={{ gpos: rule.gpos, gsub: rule.gsub, movement: rule.movement }} 
                            ligatureMap={rule.ligatureMap}
                            onEdit={() => setEditingIndex(index)}
                            onDelete={() => handleDeleteRule(index)}
                        />
                    ))}
                    {positioningRules.length === 0 && !isAdding && (
                        <p className="text-center text-gray-400 py-8 italic">No rules defined yet.</p>
                    )}
                </div>
            </section>

            <hr className="border-gray-200 dark:border-gray-700" />

            <section>
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">Anchor Defaults</h3>
                        <p className="text-sm text-gray-500">Manual attachment point overrides for specific pairs.</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {!isAddingAnchor && !editingAnchor && (
                            <button onClick={() => setIsAddingAnchor(true)} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                                <AddIcon className="w-4 h-4" /> Add Anchor
                            </button>
                        )}
                    </div>
                </div>
                
                {isAddingAnchor && (
                    <div className="mb-6">
                        <ManualAnchorForm 
                            onSave={handleSaveAnchor} 
                            onCancel={() => setIsAddingAnchor(false)}
                            characterSets={characterSets} 
                            groups={groups} 
                        />
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visibleAttachments.map((item, idx) => (
                        (editingAnchor?.base === item.base && editingAnchor?.mark === item.mark) ? (
                            <div key={`edit-${idx}`} className="col-span-full">
                                <ManualAnchorForm 
                                    onSave={handleSaveAnchor}
                                    onCancel={() => setEditingAnchor(null)}
                                    characterSets={characterSets}
                                    groups={groups}
                                    initialValues={{
                                        base: item.base,
                                        mark: item.mark,
                                        basePoint: item.rule[0],
                                        markPoint: item.rule[1],
                                        x: item.rule[2] || '0',
                                        y: item.rule[3] || '0'
                                    }}
                                />
                            </div>
                        ) : (
                            <ManualRuleCard 
                                key={`${item.base}-${item.mark}-${idx}`} 
                                base={item.base} 
                                mark={item.mark} 
                                points={{
                                    base: item.rule[0],
                                    mark: item.rule[1],
                                    x: item.rule[2] || '0',
                                    y: item.rule[3] || '0'
                                }}
                                onDelete={() => handleDeleteAttachment(item.base, item.mark, item.isVirtual)}
                                onEdit={() => setEditingAnchor({ base: item.base, mark: item.mark })}
                                isVirtual={item.isVirtual}
                            />
                        )
                    ))}
                    {visibleAttachments.length === 0 && !isAddingAnchor && (
                        <p className="col-span-full text-center text-gray-400 py-8 italic">No anchor defaults defined.</p>
                    )}
                </div>
            </section>
        </div>
    );
};

export default React.memo(RuleManager);
