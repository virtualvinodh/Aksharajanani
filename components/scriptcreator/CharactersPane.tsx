
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CharacterSet, Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { AddIcon, TrashIcon, EditIcon, SaveIcon } from '../../constants';

// FIX: Define the missing CharactersPaneProps interface.
interface CharactersPaneProps {
    sets: CharacterSet[];
    setSets: React.Dispatch<React.SetStateAction<CharacterSet[]>>;
    allChars: Character[];
}

const NEW_CHAR_STATE = { unicode: '', name: '', glyphClass: 'base' as const, lsb: '', rsb: '', advWidth: '', composite: [] as string[], link: [] as string[], isLinked: false, compositeTransform: ['', ''], option: '', desc: '', hidden: false, ifCond: '' };

const AddCharacterForm: React.FC<{
    setIndex: number;
    onAddChar: (setIndex: number, newChar: Character) => void;
    allCharsByName: Map<string, Character>;
    allCharsByUnicode: Map<number, Character>;
}> = ({ setIndex, onAddChar, allCharsByName, allCharsByUnicode }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [newChar, setNewChar] = useState(NEW_CHAR_STATE);
    
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
    
        const trimmedName = newChar.name.trim();
        if (!trimmedName) {
            showNotification(t('errorNameRequired'), 'error');
            return;
        }
    
        if (allCharsByName.has(trimmedName)) {
            showNotification(t('errorNameExists'), 'error');
            return;
        }
    
        let unicodeVal: number | undefined = undefined;
        let isPuaAssigned = false;
        const trimmedUnicode = newChar.unicode.trim();
    
        if (trimmedUnicode) {
            if (!/^[0-9a-fA-F]{1,6}$/.test(trimmedUnicode)) {
                showNotification(t('errorInvalidCodepoint'), 'error');
                return;
            }
            unicodeVal = parseInt(trimmedUnicode, 16);
            if (allCharsByUnicode.has(unicodeVal)) {
                const existingChar = allCharsByUnicode.get(unicodeVal);
                showNotification(t('errorUnicodeExists') + ` (Used by '${existingChar?.name}')`, 'error');
                return;
            }
        } else if ([...trimmedName].length === 1) {
            const derivedUnicode = trimmedName.codePointAt(0)!;
             if (allCharsByUnicode.has(derivedUnicode)) {
                showNotification(t('errorUnicodeFromCharExists', { char: trimmedName, codepoint: derivedUnicode.toString(16).toUpperCase() }), 'error');
                return;
             }
            unicodeVal = derivedUnicode;
        } else {
            isPuaAssigned = true;
        }
    
        const charToAdd: Character = {
            name: trimmedName,
            glyphClass: newChar.glyphClass,
            isPuaAssigned: isPuaAssigned,
            hidden: newChar.hidden,
            ...(newChar.lsb && { lsb: parseInt(newChar.lsb) }),
            ...(newChar.rsb && { rsb: parseInt(newChar.rsb) }),
            ...(newChar.advWidth && { advWidth: parseInt(newChar.advWidth) }),
            ...(newChar.isLinked && newChar.link.length > 0 && { link: newChar.link }),
            ...(!newChar.isLinked && newChar.composite.length > 0 && { composite: newChar.composite }),
            ...(newChar.option.trim() && { option: newChar.option.trim() }),
            ...(newChar.desc.trim() && { desc: newChar.desc.trim() }),
            ...(newChar.ifCond.trim() && { if: newChar.ifCond.trim() }),
        };

        if (unicodeVal !== undefined) {
            charToAdd.unicode = unicodeVal;
        }

        const scaleStr = newChar.compositeTransform[0].trim();
        const yOffsetStr = newChar.compositeTransform[1].trim();

        if (newChar.composite.length > 0 && (scaleStr || yOffsetStr)) {
            const scale = parseFloat(scaleStr) || 1.0;
            const yOffset = parseFloat(yOffsetStr) || 0;
            charToAdd.compositeTransform = [scale, yOffset];
        }
    
        onAddChar(setIndex, charToAdd);
        setNewChar(NEW_CHAR_STATE);
    };

    const handleComponentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const components = e.target.value.split(',').map(c => c.trim()).filter(Boolean);
        if (newChar.isLinked) {
            setNewChar(c => ({...c, link: components}));
        } else {
            setNewChar(c => ({...c, composite: components}));
        }
    };

    return (
       <tr className="bg-gray-50 dark:bg-gray-800/50">
           <td className="p-1"><input type="text" placeholder={t('glyphNamePlaceholder')} value={newChar.name} onChange={e => setNewChar(c => ({...c, name: e.target.value}))} className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/></td>
            <td className="p-1"><input type="text" placeholder={t('unicodeHexOptional')} value={newChar.unicode} onChange={e => setNewChar(c => ({...c, unicode: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '')}))} className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono"/></td>
            <td className="p-1"><select value={newChar.glyphClass} onChange={e => setNewChar(c => ({...c, glyphClass: e.target.value as any}))} className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600"><option value="base">base</option><option value="mark">mark</option><option value="ligature">ligature</option></select></td>
            <td className="p-1" colSpan={3}>
                 <div className="flex items-center gap-1">
                    <input type="number" placeholder={t('lsb')} value={newChar.lsb} onChange={e => setNewChar(c => ({...c, lsb: e.target.value}))} className="w-16 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <input type="number" placeholder={t('rsb')} value={newChar.rsb} onChange={e => setNewChar(c => ({...c, rsb: e.target.value}))} className="w-16 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <input type="number" placeholder={t('advWidth')} value={newChar.advWidth} onChange={e => setNewChar(c => ({...c, advWidth: e.target.value}))} className="w-20 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                </div>
            </td>
            <td className="p-1" colSpan={2}>
                 <input type="text" placeholder="component1, component2" value={(newChar.isLinked ? newChar.link : newChar.composite).join(', ')} onChange={handleComponentChange} className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                 <label className="text-xs flex items-center gap-1 mt-1"><input type="checkbox" checked={newChar.isLinked} onChange={e => setNewChar(c => ({...c, isLinked: e.target.checked}))} className="h-3 w-3 rounded accent-indigo-500" /> Link (read-only)</label>
                 {newChar.composite.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                        <input type="number" step="0.1" placeholder="scale (1.0)" value={newChar.compositeTransform[0]} onChange={e => setNewChar(c => ({...c, compositeTransform: [e.target.value, c.compositeTransform[1]]}))} className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs" />
                        <input type="number" placeholder="y-offset (0)" value={newChar.compositeTransform[1]} onChange={e => setNewChar(c => ({...c, compositeTransform: [c.compositeTransform[0], e.target.value]}))} className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs" />
                    </div>
                )}
            </td>
            <td className="p-1" colSpan={3}>
                <div className="flex items-center gap-1">
                    <input type="text" placeholder="Option Key" value={newChar.option} onChange={e => setNewChar(c => ({...c, option: e.target.value}))} className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <input type="text" placeholder="Description" value={newChar.desc} onChange={e => setNewChar(c => ({...c, desc: e.target.value}))} className="flex-grow p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <input type="text" placeholder="if='glyph_name'" title="Only include if 'glyph_name' is present" value={newChar.ifCond} onChange={e => setNewChar(c => ({...c, ifCond: e.target.value}))} className="w-28 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={newChar.hidden} onChange={e => setNewChar(c => ({...c, hidden: e.target.checked}))} className="h-3 w-3 rounded accent-indigo-500" /> Hide</label>
                </div>
            </td>
            <td className="p-1"><button type="button" onClick={handleFormSubmit} title={t('addCharacter')} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><AddIcon /></button></td>
       </tr>
    );
};

const CharactersPane: React.FC<CharactersPaneProps> = ({ sets, setSets, allChars }) => {
    const { t } = useLocale();
    const [editingChar, setEditingChar] = useState<{setIndex: number, charIndex: number, data: any} | null>(null);

    // FIX: Add explicit types to useMemo hooks to resolve TypeScript inference errors.
    const allCharsByName = useMemo<Map<string, Character>>(() => new Map(allChars.map((c: Character) => [c.name, c])), [allChars]);
    const allCharsByUnicode = useMemo<Map<number, Character>>(() => new Map(allChars.filter((c: Character) => c.unicode !== undefined && !c.isPuaAssigned).map((c: Character) => [c.unicode!, c])), [allChars]);

    const handleAddSet = () => setSets(prev => [...prev, { nameKey: `Set ${sets.length + 1}`, characters: [] }]);
    const onUpdateSetName = (index: number, newName: string) => setSets(prev => prev.map((set, i) => i === index ? { ...set, nameKey: newName } : set));
    const onDeleteSet = (index: number) => setSets(prev => prev.filter((_, i) => i !== index));
    const onAddChar = (setIndex: number, newChar: Character) => setSets(prev => prev.map((set, i) => i === setIndex ? { ...set, characters: [...set.characters, newChar] } : set));
    const onDeleteChar = (setIndex: number, charIndex: number) => setSets(prev => prev.map((set, i) => i === setIndex ? { ...set, characters: set.characters.filter((_, ci) => ci !== charIndex) } : set));

    const handleUpdateCharacter = (setIndex: number, charIndex: number, updatedChar: Character) => {
        setSets(prev => prev.map((set, i) => {
            if (i === setIndex) {
                const newChars = [...set.characters];
                newChars[charIndex] = updatedChar;
                return { ...set, characters: newChars };
            }
            return set;
        }));
    };

    const handleSaveEdit = () => {
        if (!editingChar) return;
        // Same validation as AddCharacterForm can be added here if needed
        const { setIndex, charIndex, data } = editingChar;
        const charToUpdate = sets[setIndex].characters[charIndex];
        
        const updatedChar: Character = {
            ...charToUpdate,
            name: data.name,
            glyphClass: data.glyphClass,
            lsb: data.lsb !== '' ? parseInt(data.lsb) : undefined,
            rsb: data.rsb !== '' ? parseInt(data.rsb) : undefined,
            advWidth: data.advWidth !== '' ? parseInt(data.advWidth) : undefined,
            composite: !data.isLinked && data.composite.length > 0 ? data.composite : undefined,
            link: data.isLinked && data.link.length > 0 ? data.link : undefined,
            hidden: data.hidden,
        };

        const unicodeStr = data.unicode.trim();
        if (unicodeStr) { updatedChar.unicode = parseInt(unicodeStr, 16); updatedChar.isPuaAssigned = false; }
        else if ([...data.name].length === 1) { updatedChar.unicode = data.name.codePointAt(0); updatedChar.isPuaAssigned = false; }
        else { delete updatedChar.unicode; updatedChar.isPuaAssigned = true; }

        const scaleStr = (data.compositeTransform[0] || '').toString().trim();
        const yOffsetStr = (data.compositeTransform[1] || '').toString().trim();
        if ((data.composite.length > 0 || data.link.length > 0) && (scaleStr || yOffsetStr)) {
            updatedChar.compositeTransform = [parseFloat(scaleStr) || 1.0, parseFloat(yOffsetStr) || 0];
        } else { delete updatedChar.compositeTransform; }

        updatedChar.option = data.option.trim() ? data.option.trim() : undefined;
        if (!updatedChar.option) delete updatedChar.option;
        updatedChar.desc = data.desc.trim() ? data.desc.trim() : undefined;
        if (!updatedChar.desc) delete updatedChar.desc;
        updatedChar.if = data.ifCond.trim() ? data.ifCond.trim() : undefined;
        if (!updatedChar.if) delete updatedChar.if;
        
        handleUpdateCharacter(setIndex, charIndex, updatedChar);
        setEditingChar(null);
    };

    const handleStartEdit = (setIndex: number, charIndex: number, char: Character) => {
        setEditingChar({ setIndex, charIndex, data: {
            name: char.name || '',
            unicode: char.unicode !== undefined && !char.isPuaAssigned ? char.unicode.toString(16).toUpperCase() : '',
            glyphClass: char.glyphClass || 'base',
            lsb: char.lsb ?? '',
            rsb: char.rsb ?? '',
            advWidth: char.advWidth ?? '',
            composite: char.composite || [],
            link: char.link || [],
            isLinked: !!char.link,
            compositeTransform: [
                (char.compositeTransform as any)?.[0] ?? '',
                (char.compositeTransform as any)?.[1] ?? ''
            ],
            option: char.option || '',
            desc: char.desc || '',
            hidden: char.hidden || false,
            ifCond: char.if || ''
        }});
    };

    const handleComponentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!editingChar) return;
        const components = e.target.value.split(',').map(c => c.trim()).filter(Boolean);
        if (editingChar.data.isLinked) {
            setEditingChar(s => s ? {...s, data: {...s.data, link: components}} : null);
        } else {
            setEditingChar(s => s ? {...s, data: {...s.data, composite: components}} : null);
        }
    };

    return <div className="space-y-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('charactersTabDescription')}</h3></div>
        {sets.map((set, setIndex) => (
            <div key={setIndex} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="flex justify-between items-center mb-4">
                    <input type="text" value={set.nameKey} onChange={(e) => onUpdateSetName(setIndex, e.target.value)} className="text-xl font-bold p-1 -m-1 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none" />
                    <button onClick={() => onDeleteSet(setIndex)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon /></button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700"><tr>
                            <th className="p-2">Name</th><th className="p-2">Unicode</th><th className="p-2">Class</th><th className="p-2" colSpan={3}>Metrics (LSB/RSB/Adv)</th><th className="p-2" colSpan={2}>Components</th><th className="p-2" colSpan={3}>Variants & Conditions</th><th className="p-2">Actions</th>
                        </tr></thead>
                        <tbody>
                            {set.characters.map((char, charIndex) => (
                                editingChar?.setIndex === setIndex && editingChar?.charIndex === charIndex ? (
                                    <tr key={charIndex} className="bg-indigo-50 dark:bg-indigo-900/20">
                                        <td className="p-1"><input type="text" value={editingChar.data.name} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, name: e.target.value}} : null)} className="w-full p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><input type="text" value={editingChar.data.unicode} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, unicode: e.target.value}} : null)} className="w-24 p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><select value={editingChar.data.glyphClass} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, glyphClass: e.target.value as any}} : null)} className="w-full p-1 border rounded dark:bg-gray-700"><option>base</option><option>mark</option><option>ligature</option></select></td>
                                        <td className="p-1" colSpan={3}><div className="flex items-center gap-1"><input type="number" value={editingChar.data.lsb} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, lsb: e.target.value}} : null)} className="w-16 p-1 border rounded dark:bg-gray-700"/><input type="number" value={editingChar.data.rsb} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, rsb: e.target.value}} : null)} className="w-16 p-1 border rounded dark:bg-gray-700"/><input type="number" value={editingChar.data.advWidth} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, advWidth: e.target.value}} : null)} className="w-20 p-1 border rounded dark:bg-gray-700"/></div></td>
                                        <td className="p-1" colSpan={2}><input type="text" placeholder="comp1, comp2" value={(editingChar.data.isLinked ? editingChar.data.link : editingChar.data.composite).join(', ')} onChange={handleComponentChange} className="w-full p-1 border rounded dark:bg-gray-700"/><label className="text-xs flex items-center gap-1 mt-1"><input type="checkbox" checked={editingChar.data.isLinked} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, isLinked: e.target.checked}} : null)} className="h-3 w-3" /> Link</label></td>
                                        <td className="p-1" colSpan={3}><div className="flex items-center gap-1"><input type="text" value={editingChar.data.option} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, option: e.target.value}} : null)} className="w-24 p-1 border rounded dark:bg-gray-700"/><input type="text" value={editingChar.data.desc} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, desc: e.target.value}} : null)} className="flex-grow p-1 border rounded dark:bg-gray-700"/><input type="text" value={editingChar.data.ifCond} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, ifCond: e.target.value}} : null)} className="w-28 p-1 border rounded dark:bg-gray-700"/><label className="text-xs flex items-center gap-1"><input type="checkbox" checked={editingChar.data.hidden} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, hidden: e.target.checked}} : null)} className="h-3 w-3" /> Hide</label></div></td>
                                        <td className="p-1 flex items-center gap-1"><button onClick={handleSaveEdit} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><SaveIcon/></button><button onClick={() => setEditingChar(null)} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">{t('cancel')}</button></td>
                                    </tr>
                                ) : (
                                <tr key={charIndex} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="p-2 font-xl font-bold">{char.name}</td><td className="p-2 font-mono">{char.unicode !== undefined && !char.isPuaAssigned ? `U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')}` : '-'}</td><td className="p-2">{char.glyphClass}</td><td className="p-2">{char.lsb}</td><td className="p-2">{char.rsb}</td><td className="p-2">{char.advWidth}</td>
                                    <td className="p-2" colSpan={2}>{(char.composite || char.link)?.join(', ')} {char.link && <span className="text-xs text-blue-500">(L)</span>}</td><td className="p-2">{char.option}</td><td className="p-2">{char.desc}</td><td className="p-2">{char.if} {char.hidden && <span className="text-xs text-gray-500">(H)</span>}</td>
                                    <td className="p-2 flex items-center gap-1"><button onClick={() => handleStartEdit(setIndex, charIndex, char)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><EditIcon/></button><button onClick={() => onDeleteChar(setIndex, charIndex)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon /></button></td>
                                </tr>
                            ))}
                             <AddCharacterForm 
                                setIndex={setIndex} 
                                onAddChar={onAddChar}
                                allCharsByName={allCharsByName}
                                allCharsByUnicode={allCharsByUnicode}
                            />
                        </tbody>
                    </table>
                </div>
            </div>
        ))}
        <button onClick={handleAddSet} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg"><AddIcon /> {t('addCharacterSet')}</button>
    </div>;
};

export default CharactersPane;
