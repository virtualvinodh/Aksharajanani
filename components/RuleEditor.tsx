
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Character, GlyphData, CharacterSet } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { ClearIcon, AddIcon, TrashIcon } from '../constants';
import GlyphSelectionModal from './GlyphSelectionModal';
import GlyphTile from './GlyphTile';
import GlyphSelect from './scriptcreator/GlyphSelect';

type LigatureRule = { ligatureName: string; componentNames: string[] };
type ContextualRuleValue = { replace: string[]; left?: string[]; right?: string[] };
type ContextualRule = { replacementName: string, rule: ContextualRuleValue };
type MultipleRule = { inputName: string[], outputString: string };
type SingleRule = { outputName: string, inputName: string[] };
export type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
type RuleEditorMode = 'editing' | 'creating';

interface RuleEditorProps {
    ruleKey?: string;
    ruleValue?: any;
    ruleType: RuleType;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    glyphDataMap?: Map<number, GlyphData>;
    strokeThickness?: number;
    isNew: boolean;
    onSave: (newRule: LigatureRule | ContextualRule | MultipleRule | SingleRule, ruleType: RuleEditorProps['ruleType']) => void;
    onCancel?: () => void;
    showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
    mode?: RuleEditorMode;
    groups?: Record<string, string[]>;
    glyphVersion?: number;
}

interface GlyphSlotProps {
    onClick: () => void;
    char: Character | null;
    glyphData: GlyphData | undefined;
    strokeThickness: number;
    prompt: string;
    onClear?: () => void;
}
const GlyphSlot: React.FC<GlyphSlotProps> = React.memo(({ onClick, char, glyphData, strokeThickness, prompt, onClear }) => {
    return (
        <div className="relative">
            <div 
                onClick={onClick}
                className={`w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${char ? 'border-gray-300 dark:border-gray-600' : 'border-gray-400 dark:border-gray-500'}`}
            >
                {char && glyphData ? (
                    <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />
                ) : (
                    <span className="text-xs text-gray-500 text-center p-1">{prompt}</span>
                )}
            </div>
            {char && onClear && (
                 <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                    <ClearIcon />
                </button>
            )}
        </div>
    );
});

const GroupSlot: React.FC<{ 
    value: string; 
    groups: Record<string, string[]>; 
    onChange: (newValue: string) => void; 
    onRemove: () => void; 
}> = ({ value, groups, onChange, onRemove }) => {
    const groupNames = Object.keys(groups);
    const prefix = value.charAt(0); // '$' or '@'

    return (
        <div className="relative group z-10">
            <div className="w-20 h-20 border-2 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-900/50 cursor-pointer border-purple-200 dark:border-purple-800 group-hover:border-purple-400">
                <span className="font-mono text-sm text-purple-800 dark:text-purple-200">{value.replace('$', '@')}</span>
            </div>
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }} 
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 z-20"
                type="button"
            >
                <ClearIcon />
            </button>
            
            {groupNames.length > 0 && (
                <div className="absolute hidden group-hover:block top-full pt-1 left-1/2 -translate-x-1/2 z-30">
                    <div className="bg-white dark:bg-gray-700 rounded-md shadow-xl border dark:border-gray-600 p-1 min-w-[120px] max-h-48 overflow-y-auto">
                        {groupNames.map(name => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => onChange(`${prefix}${name}`)}
                                className={`w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-purple-50 dark:hover:bg-gray-600 font-mono block ${value === prefix + name ? 'bg-purple-100 dark:bg-gray-600 font-bold' : ''}`}
                            >
                                @{name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const GroupSelector: React.FC<{ groups: Record<string, string[]>, onSelect: (groupName: string) => void, verticalPosition?: 'top' | 'bottom' }> = ({ groups, onSelect, verticalPosition = 'bottom' }) => {
    const { t } = useLocale();
    const groupNames = Object.keys(groups);

    return (
        <div className="relative group">
            <button type="button" className="w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center transition-colors text-xs text-gray-500 hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border-gray-400 dark:border-gray-500">
                {t('addGroup')}
            </button>
            {groupNames.length > 0 && (
                <div className={`absolute hidden group-hover:block z-20 ${verticalPosition === 'bottom' ? 'top-full pt-2' : 'bottom-full pb-2'} left-1/2 -translate-x-1/2`}>
                    <div className="bg-white dark:bg-gray-700 rounded-md shadow-lg border dark:border-gray-600 p-1 min-w-[120px]">
                        {groupNames.map(name => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => onSelect(`$${name}`)}
                                className="w-full text-left px-3 py-1 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 font-mono"
                            >
                                @{name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


const RuleEditor: React.FC<RuleEditorProps> = ({ 
    ruleKey, ruleValue, ruleType, allCharacterSets, allCharsByName, 
    glyphDataMap, strokeThickness = 15, isNew, onSave, onCancel, showNotification, mode = 'editing',
    groups = {}, glyphVersion
}) => {
    const { t } = useLocale();
    
    // State for Ligature Editor
    const [components, setComponents] = useState<string[]>([]);
    const [ligature, setLigature] = useState<string | null>(null);

    // State for Contextual Editor
    const [leftContext, setLeftContext] = useState<string[]>([]);
    const [target, setTarget] = useState<string[]>([]);
    const [rightContext, setRightContext] = useState<string[]>([]);
    const [replacement, setReplacement] = useState<string | null>(null);
    
    // State for Multiple Substitution Editor
    const [multiInputGlyph, setMultiInputGlyph] = useState<string | null>(null);
    const [outputSequence, setOutputSequence] = useState<string[]>([]);

    // State for Single Substitution Editor
    const [singleInput, setSingleInput] = useState<string | null>(null);
    const [singleOutput, setSingleOutput] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState<{ type: string; index?: number } | null>(null);

    useEffect(() => {
        if (!isNew) {
            if (ruleType === 'ligature') {
                setComponents(ruleValue || []);
                setLigature(ruleKey || null);
            } else if (ruleType === 'contextual') {
                setLeftContext(ruleValue?.left || []);
                setTarget(Array.isArray(ruleValue?.replace) ? ruleValue.replace : []);
                setRightContext(ruleValue?.right || []);
                setReplacement(ruleKey || null);
            } else if (ruleType === 'multiple') {
                setMultiInputGlyph(Array.isArray(ruleValue) ? ruleValue[0] : null);
                setOutputSequence((ruleKey || '').split(',').map(s => s.trim()).filter(Boolean));
            } else if (ruleType === 'single') {
                setSingleInput(Array.isArray(ruleValue) ? ruleValue[0] : null);
                setSingleOutput(ruleKey || null);
            }
        } else {
            // Reset state when switching to new rule mode
            setComponents([]); setLigature(null);
            setLeftContext([]); setTarget([]); setRightContext([]); setReplacement(null);
            setMultiInputGlyph(null); setOutputSequence([]);
            setSingleInput(null); setSingleOutput(null);
        }
    }, [isNew, ruleKey, ruleValue, ruleType]);

    const openGlyphModal = (type: string, index?: number) => {
        setModalTarget({ type, index });
        setIsModalOpen(true);
    };

    const handleGlyphSelect = (char: Character) => {
        if (!modalTarget) return;
        const { type, index } = modalTarget;

        const updateArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, name: string, idx?: number) => {
            setter(prev => {
                const newArr = [...prev];
                if (idx !== undefined) newArr[idx] = name;
                return newArr;
            });
        };

        switch (type) {
            case 'ligature-output': setLigature(char.name); break;
            case 'component-add': setComponents(prev => [...prev, char.name]); break;
            case 'component-replace': updateArray(setComponents, char.name, index); break;
            case 'context-left-add': setLeftContext(prev => [...prev, char.name]); break;
            case 'context-left-replace': updateArray(setLeftContext, char.name, index); break;
            case 'context-target-add': setTarget(prev => [...prev, char.name]); break;
            case 'context-target-replace': updateArray(setTarget, char.name, index); break;
            case 'context-right-add': setRightContext(prev => [...prev, char.name]); break;
            case 'context-right-replace': updateArray(setRightContext, char.name, index); break;
            case 'context-replacement': setReplacement(char.name); break;
            case 'multi-input': setMultiInputGlyph(char.name); break;
            case 'multi-output-add': setOutputSequence(prev => [...prev, char.name]); break;
            case 'multi-output-replace': updateArray(setOutputSequence, char.name, index); break;
            case 'single-input': setSingleInput(char.name); break;
            case 'single-output': setSingleOutput(char.name); break;
        }
        
        setIsModalOpen(false);
        setModalTarget(null);
    };

    const handleSave = () => {
        if (ruleType === 'ligature') {
            if (ligature && components.length > 0) {
                onSave({ ligatureName: ligature, componentNames: components }, 'ligature');
                if (isNew) { setComponents([]); setLigature(null); }
            } else {
                showNotification(t('errorLigatureRule'), 'error');
            }
        } else if (ruleType === 'contextual') {
            if (target.length > 0 && replacement && (leftContext.length > 0 || rightContext.length > 0)) {
                const rule: ContextualRuleValue = { replace: target };
                if (leftContext.length > 0) rule.left = leftContext;
                if (rightContext.length > 0) rule.right = rightContext;
                onSave({ replacementName: replacement, rule }, 'contextual');
                 if (isNew) { setLeftContext([]); setTarget([]); setRightContext([]); setReplacement(null); }
            } else {
                showNotification(t('errorContextualRule'), 'error');
            }
        } else if (ruleType === 'multiple') {
             if (multiInputGlyph && outputSequence.length > 0) {
                onSave({ inputName: [multiInputGlyph], outputString: outputSequence.join(',') }, 'multiple');
                if (isNew) { setMultiInputGlyph(null); setOutputSequence([]); }
             } else {
                showNotification(t('errorMultipleRule'), 'error');
             }
        } else if (ruleType === 'single') {
            if (singleInput && singleOutput) {
                onSave({ outputName: singleOutput, inputName: [singleInput] }, 'single');
                if (isNew) { setSingleInput(null); setSingleOutput(null); }
            } else {
                showNotification(t('errorSingleRule'), 'error');
            }
        }
    };
    
    const renderCreatingMode = () => {
        if (ruleType === 'ligature') {
            return (
                 <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-4">
                        <div className="w-full md:w-auto">
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('inputComponents')}</h4>
                            <div className="flex items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[60px]">
                                {components.map((name, index) => (
                                    <div key={index} className="flex items-center gap-1">
                                        <GlyphSelect characterSets={allCharacterSets} value={name} onChange={val => setComponents(c => c.map((n, i) => i === index ? val : n))} label={t('inputComponents')} groups={groups} />
                                        <button type="button" onClick={() => setComponents(c => c.filter((_, i) => i !== index))} className="p-1 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button>
                                    </div>
                                ))}
                                <button type="button" onClick={() => setComponents(prev => [...prev, ''])} className="p-2 bg-gray-200 dark:bg-gray-600 rounded-full hover:bg-gray-300 dark:hover:bg-gray-500"><AddIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('outputLigature')}</h4>
                            <GlyphSelect characterSets={allCharacterSets} value={ligature || ''} onChange={setLigature} label={t('outputLigature')} />
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'contextual') {
            return (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-2">
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('leftContext')}</h4>
                             <div className="flex flex-col items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[60px]">
                                {leftContext.map((name, index) => <div key={index} className="flex items-center gap-1"><GlyphSelect characterSets={allCharacterSets} value={name} onChange={val => setLeftContext(c => c.map((n, i) => i === index ? val : n))} label={t('leftContext')} groups={groups} /><button onClick={() => setLeftContext(c => c.filter((_, i) => i !== index))} className="p-1 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button></div>)}
                                <button onClick={() => setLeftContext(prev => [...prev, ''])} className="p-2 bg-gray-200 dark:bg-gray-600 rounded-full"><AddIcon className="w-4 h-4"/></button>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('targetGlyph')}</h4>
                            <div className="flex flex-col items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[60px]">
                                {target.map((name, index) => <div key={index} className="flex items-center gap-1"><GlyphSelect characterSets={allCharacterSets} value={name} onChange={val => setTarget(c => c.map((n, i) => i === index ? val : n))} label={`${t('targetGlyph')} ${index+1}`} groups={groups} /><button onClick={() => setTarget(c => c.filter((_, i) => i !== index))} className="p-1 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button></div>)}
                                <button onClick={() => setTarget(prev => [...prev, ''])} className="p-2 bg-gray-200 dark:bg-gray-600 rounded-full"><AddIcon className="w-4 h-4"/></button>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('rightContext')}</h4>
                             <div className="flex flex-col items-center gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[60px]">
                                {rightContext.map((name, index) => <div key={index} className="flex items-center gap-1"><GlyphSelect characterSets={allCharacterSets} value={name} onChange={val => setRightContext(c => c.map((n, i) => i === index ? val : n))} label={t('rightContext')} groups={groups} /><button onClick={() => setRightContext(c => c.filter((_, i) => i !== index))} className="p-1 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button></div>)}
                                <button onClick={() => setRightContext(prev => [...prev, ''])} className="p-2 bg-gray-200 dark:bg-gray-600 rounded-full"><AddIcon className="w-4 h-4"/></button>
                            </div>
                        </div>
                        <div className="self-center text-3xl font-bold mx-2 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>
                        <div className="pt-5"><GlyphSelect characterSets={allCharacterSets} value={replacement || ''} onChange={setReplacement} label={t('replacementGlyph')} /></div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'multiple') {
            return (
                 <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-4">
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('inputGlyph')}</h4>
                            <GlyphSelect characterSets={allCharacterSets} value={multiInputGlyph || ''} onChange={setMultiInputGlyph} label={t('inputGlyph')} groups={groups} />
                        </div>
                        <div className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>
                        <div className="w-full md:w-auto">
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('outputSequence')}</h4>
                            <div className="flex items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[60px]">
                                {outputSequence.map((name, index) => <div key={index} className="flex items-center gap-1"><GlyphSelect characterSets={allCharacterSets} value={name} onChange={val => setOutputSequence(c => c.map((n, i) => i === index ? val : n))} label={t('outputSequence')} groups={groups} /><button onClick={() => setOutputSequence(c => c.filter((_, i) => i !== index))} className="p-1 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon/></button></div>)}
                                <button onClick={() => setOutputSequence(prev => [...prev, ''])} className="p-2 bg-gray-200 dark:bg-gray-600 rounded-full"><AddIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'single') {
            return (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        {/* Input Slot */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-center">{t('inputGlyph')}</h4>
                            <div className="flex items-center gap-2">
                                {singleInput ? (
                                    singleInput.startsWith('@') || singleInput.startsWith('$') ? (
                                        <GroupSlot
                                            value={singleInput}
                                            groups={groups}
                                            onChange={(val) => setSingleInput(val)}
                                            onRemove={() => setSingleInput(null)}
                                        />
                                    ) : (
                                        <GlyphSlot
                                            onClick={() => openGlyphModal('single-input')}
                                            onClear={() => setSingleInput(null)}
                                            char={allCharsByName.get(singleInput) || null}
                                            glyphData={allCharsByName.get(singleInput) ? glyphDataMap?.get(allCharsByName.get(singleInput)!.unicode) : undefined}
                                            strokeThickness={strokeThickness}
                                            prompt=""
                                        />
                                    )
                                ) : (
                                    <>
                                        <GlyphSlot onClick={() => openGlyphModal('single-input')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('select')} />
                                        <GroupSelector groups={groups || {}} onSelect={groupName => setSingleInput(groupName)} />
                                    </>
                                )}
                            </div>
                        </div>

                        <span className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform sm:rotate-0 rotate-90 pt-0">→</span>
                        
                        {/* Output Slot */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-center">{t('outputGlyph')}</h4>
                            <div className="flex items-center gap-2">
                                {singleOutput ? (
                                    singleOutput.startsWith('@') || singleOutput.startsWith('$') ? (
                                        <GroupSlot
                                            value={singleOutput}
                                            groups={groups}
                                            onChange={(val) => setSingleOutput(val)}
                                            onRemove={() => setSingleOutput(null)}
                                        />
                                    ) : (
                                        <GlyphSlot
                                            onClick={() => openGlyphModal('single-output')}
                                            onClear={() => setSingleOutput(null)}
                                            char={allCharsByName.get(singleOutput) || null}
                                            glyphData={allCharsByName.get(singleOutput) ? glyphDataMap?.get(allCharsByName.get(singleOutput)!.unicode) : undefined}
                                            strokeThickness={strokeThickness}
                                            prompt=""
                                        />
                                    )
                                ) : (
                                    <>
                                        <GlyphSlot onClick={() => openGlyphModal('single-output')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('select')} />
                                        <GroupSelector groups={groups || {}} onSelect={groupName => setSingleOutput(groupName)} />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };
    
    const renderEditingMode = () => {
        if (ruleType === 'ligature') {
            return (
                 <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-4">
                        <div className="w-full md:w-auto">
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('inputComponents')}</h4>
                            <div className="flex items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                                {components.map((name, index) => {
                                    if (name.startsWith('@') || name.startsWith('$')) {
                                        return (
                                            <GroupSlot
                                                key={`group-${index}`}
                                                value={name}
                                                groups={groups}
                                                onChange={(val) => setComponents(p => p.map((v, i) => i === index ? val : v))}
                                                onRemove={() => setComponents(p => p.filter((_, i) => i !== index))}
                                            />
                                        );
                                    }
                                    const char = allCharsByName.get(name);
                                    return (
                                        <GlyphSlot
                                            key={index}
                                            onClick={() => openGlyphModal('component-replace', index)}
                                            onClear={() => setComponents(p => p.filter((_, i) => i !== index))}
                                            char={char || null}
                                            glyphData={char ? glyphDataMap?.get(char.unicode) : undefined}
                                            strokeThickness={strokeThickness}
                                            prompt=""
                                        />
                                    );
                                })}
                                <GlyphSlot onClick={() => openGlyphModal('component-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                                <GroupSelector groups={groups || {}} onSelect={groupName => setComponents(p => [...p, groupName])} />
                            </div>
                        </div>
                        <div className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('outputLigature')}</h4>
                            <GlyphSlot 
                                onClick={() => openGlyphModal('ligature-output')} 
                                onClear={() => setLigature(null)}
                                char={ligature ? allCharsByName.get(ligature)! : null}
                                glyphData={ligature ? glyphDataMap?.get(allCharsByName.get(ligature)!.unicode) : undefined}
                                strokeThickness={strokeThickness}
                                prompt={t('select')}
                            />
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'contextual') {
            return (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-2">
                        {/* Left Context */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('leftContext')}</h4>
                            <div className="flex flex-row md:flex-col items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                                {leftContext.map((name, index) => name.startsWith('@') || name.startsWith('$') ? 
                                    <GroupSlot
                                        key={index}
                                        value={name}
                                        groups={groups}
                                        onChange={(val) => setLeftContext(p => p.map((v, i) => i === index ? val : v))}
                                        onRemove={() => setLeftContext(p => p.filter((_, i) => i !== index))}
                                    /> :
                                    <GlyphSlot key={index} onClick={() => openGlyphModal('context-left-replace', index)} onClear={() => setLeftContext(p => p.filter((_, i) => i !== index))} char={allCharsByName.get(name) || null} glyphData={allCharsByName.get(name) ? glyphDataMap?.get(allCharsByName.get(name)!.unicode) : undefined} strokeThickness={strokeThickness} prompt='' />)}
                                <GlyphSlot onClick={() => openGlyphModal('context-left-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                                <GroupSelector groups={groups || {}} onSelect={groupName => setLeftContext(p => [...p, groupName])} />
                            </div>
                        </div>
                        {/* Target */}
                        <div className="pt-0">
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-center">{t('targetGlyph')}</h4>
                            <div className="flex items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px] justify-center">
                                {target.map((name, index) => (
                                    <GlyphSlot
                                        key={index}
                                        onClick={() => openGlyphModal('context-target-replace', index)}
                                        onClear={() => setTarget(p => p.filter((_, i) => i !== index))}
                                        char={allCharsByName.get(name) || null}
                                        glyphData={allCharsByName.get(name) ? glyphDataMap?.get(allCharsByName.get(name)!.unicode) : undefined}
                                        strokeThickness={strokeThickness}
                                        prompt=''
                                    />
                                ))}
                                <GlyphSlot
                                    onClick={() => openGlyphModal('context-target-add')}
                                    char={null} glyphData={undefined}
                                    strokeThickness={strokeThickness}
                                    prompt={t('add')}
                                />
                            </div>
                        </div>
                        {/* Right Context */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('rightContext')}</h4>
                             <div className="flex flex-row md:flex-col items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                                {rightContext.map((name, index) => name.startsWith('@') || name.startsWith('$') ? 
                                    <GroupSlot
                                        key={index}
                                        value={name}
                                        groups={groups}
                                        onChange={(val) => setRightContext(p => p.map((v, i) => i === index ? val : v))}
                                        onRemove={() => setRightContext(p => p.filter((_, i) => i !== index))}
                                    /> :
                                    <GlyphSlot key={index} onClick={() => openGlyphModal('context-right-replace', index)} onClear={() => setRightContext(p => p.filter((_, i) => i !== index))} char={allCharsByName.get(name) || null} glyphData={allCharsByName.get(name) ? glyphDataMap?.get(allCharsByName.get(name)!.unicode) : undefined} strokeThickness={strokeThickness} prompt='' />)}
                                <GlyphSlot onClick={() => openGlyphModal('context-right-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                                <GroupSelector groups={groups || {}} onSelect={groupName => setRightContext(p => [...p, groupName])} />
                            </div>
                        </div>

                        <div className="self-center text-3xl font-bold mx-2 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>
                        
                        {/* Replacement */}
                         <div className="pt-0">
                            <GlyphSlot onClick={() => openGlyphModal('context-replacement')} onClear={() => setReplacement(null)} char={replacement ? allCharsByName.get(replacement)! : null} glyphData={replacement ? glyphDataMap?.get(allCharsByName.get(replacement)!.unicode) : undefined} strokeThickness={strokeThickness} prompt={t('replacementGlyph')} />
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'multiple') {
            return (
                 <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-4">
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('inputGlyph')}</h4>
                            <GlyphSlot 
                                onClick={() => openGlyphModal('multi-input')} 
                                onClear={() => setMultiInputGlyph(null)}
                                char={multiInputGlyph ? allCharsByName.get(multiInputGlyph)! : null}
                                glyphData={multiInputGlyph ? glyphDataMap?.get(allCharsByName.get(multiInputGlyph)!.unicode) : undefined}
                                strokeThickness={strokeThickness}
                                prompt={t('select')}
                            />
                        </div>

                        <div className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform md:rotate-0 rotate-90 pt-0">→</div>

                        <div className="w-full md:w-auto">
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">{t('outputSequence')}</h4>
                            <div className="flex items-center flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-md min-h-[120px]">
                                {outputSequence.map((name, index) => {
                                    if (name.startsWith('@') || name.startsWith('$')) {
                                        return (
                                            <GroupSlot
                                                key={`group-${index}`}
                                                value={name}
                                                groups={groups}
                                                onChange={(val) => setOutputSequence(p => p.map((v, i) => i === index ? val : v))}
                                                onRemove={() => setOutputSequence(p => p.filter((_, i) => i !== index))}
                                            />
                                        );
                                    }
                                    const char = allCharsByName.get(name);
                                    return <GlyphSlot key={index} onClick={() => openGlyphModal('multi-output-replace', index)} onClear={() => setOutputSequence(p => p.filter((_, i) => i !== index))} char={char || null} glyphData={char ? glyphDataMap?.get(char.unicode) : undefined} strokeThickness={strokeThickness} prompt="" />
                                })}
                                <GlyphSlot onClick={() => openGlyphModal('multi-output-add')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('add')} />
                                <GroupSelector groups={groups || {}} onSelect={groupName => setOutputSequence(p => [...p, groupName])} />
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        if (ruleType === 'single') {
            return (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        {/* Input Slot */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-center">{t('inputGlyph')}</h4>
                            <div className="flex items-center gap-2">
                                {singleInput ? (
                                    singleInput.startsWith('@') || singleInput.startsWith('$') ? (
                                        <GroupSlot
                                            value={singleInput}
                                            groups={groups}
                                            onChange={(val) => setSingleInput(val)}
                                            onRemove={() => setSingleInput(null)}
                                        />
                                    ) : (
                                        <GlyphSlot
                                            onClick={() => openGlyphModal('single-input')}
                                            onClear={() => setSingleInput(null)}
                                            char={allCharsByName.get(singleInput) || null}
                                            glyphData={allCharsByName.get(singleInput) ? glyphDataMap?.get(allCharsByName.get(singleInput)!.unicode) : undefined}
                                            strokeThickness={strokeThickness}
                                            prompt=""
                                        />
                                    )
                                ) : (
                                    <>
                                        <GlyphSlot onClick={() => openGlyphModal('single-input')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('select')} />
                                        <GroupSelector groups={groups || {}} onSelect={groupName => setSingleInput(groupName)} />
                                    </>
                                )}
                            </div>
                        </div>

                        <span className="self-center text-3xl font-bold mx-4 text-indigo-500 dark:text-indigo-400 transform sm:rotate-0 rotate-90 pt-0">→</span>
                        
                        {/* Output Slot */}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 text-center">{t('outputGlyph')}</h4>
                            <div className="flex items-center gap-2">
                                {singleOutput ? (
                                    singleOutput.startsWith('@') || singleOutput.startsWith('$') ? (
                                        <GroupSlot
                                            value={singleOutput}
                                            groups={groups}
                                            onChange={(val) => setSingleOutput(val)}
                                            onRemove={() => setSingleOutput(null)}
                                        />
                                    ) : (
                                        <GlyphSlot
                                            onClick={() => openGlyphModal('single-output')}
                                            onClear={() => setSingleOutput(null)}
                                            char={allCharsByName.get(singleOutput) || null}
                                            glyphData={allCharsByName.get(singleOutput) ? glyphDataMap?.get(allCharsByName.get(singleOutput)!.unicode) : undefined}
                                            strokeThickness={strokeThickness}
                                            prompt=""
                                        />
                                    )
                                ) : (
                                    <>
                                        <GlyphSlot onClick={() => openGlyphModal('single-output')} char={null} glyphData={undefined} strokeThickness={strokeThickness} prompt={t('select')} />
                                        <GroupSelector groups={groups || {}} onSelect={groupName => setSingleOutput(groupName)} />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div>
            {mode === 'creating' ? renderCreatingMode() : renderEditingMode()}
            <div className="flex justify-end gap-4 mt-4">
                {onCancel && <button onClick={onCancel} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>}
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                    {isNew ? t('saveRule') : t('updateRule')}
                </button>
            </div>
             {mode === 'editing' && (
                <GlyphSelectionModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSelect={handleGlyphSelect}
                    characterSets={allCharacterSets}
                    glyphDataMap={glyphDataMap!}
                />
             )}
        </div>
    );
};

export default React.memo(RuleEditor);
