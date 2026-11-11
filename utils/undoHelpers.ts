import { Character, CharacterSet } from '../types';

/**
 * Undo for deletes and bulk edits (P13). These used to restore whole snapshots of the glyph,
 * character, kerning and positioning data, which also threw away everything edited after the
 * operation. The helpers below put back only what the operation removed or changed.
 */

export interface RemovedCharacter {
    char: Character;
    setNameKey: string;
    setIndex: number;
    index: number;
}

/** Records where each of the given characters sits, so it can be put back in the same place. */
export const findCharacterLocations = (sets: CharacterSet[] | null | undefined, unicodes: Set<number>): RemovedCharacter[] => {
    const found: RemovedCharacter[] = [];
    (sets || []).forEach((set, setIndex) => {
        set.characters.forEach((char, index) => {
            if (char.unicode !== undefined && unicodes.has(char.unicode)) {
                found.push({ char: { ...char }, setNameKey: set.nameKey, setIndex, index });
            }
        });
    });
    return found;
};

/**
 * Re-inserts removed characters at their old positions (recreating a set that became empty and
 * was dropped), skipping any that exist again, and optionally re-applies saved fields to other
 * characters. Everything else in `sets` is left as it is now.
 */
export const restoreCharacters = (
    sets: CharacterSet[] | null | undefined,
    removed: RemovedCharacter[],
    fieldRestores?: Map<number, Partial<Character>>
): CharacterSet[] => {
    let result: CharacterSet[] = (sets || []).map(set => ({ ...set, characters: [...set.characters] }));
    const present = new Set<number>();
    result.forEach(set => set.characters.forEach(c => { if (c.unicode !== undefined) present.add(c.unicode); }));

    const ordered = [...removed].sort((a, b) => a.setIndex - b.setIndex || a.index - b.index);
    for (const item of ordered) {
        if (item.char.unicode !== undefined && present.has(item.char.unicode)) continue;
        let set = result.find(s => s.nameKey === item.setNameKey);
        if (!set) {
            set = { nameKey: item.setNameKey, characters: [] };
            result.splice(Math.min(item.setIndex, result.length), 0, set);
        }
        set.characters.splice(Math.min(item.index, set.characters.length), 0, item.char);
        if (item.char.unicode !== undefined) present.add(item.char.unicode);
    }

    if (fieldRestores && fieldRestores.size > 0) {
        result = result.map(set => ({
            ...set,
            characters: set.characters.map(c => (c.unicode !== undefined && fieldRestores.has(c.unicode)) ? { ...c, ...fieldRestores.get(c.unicode) } : c),
        }));
    }
    return result;
};

/** Entries of `map` whose "a-b" key involves any of the given code points. */
export const pairEntriesInvolving = <V>(map: Map<string, V>, unicodes: Set<number>): Map<string, V> => {
    const out = new Map<string, V>();
    map.forEach((value, key) => {
        const [a, b] = key.split('-').map(Number);
        if (unicodes.has(a) || unicodes.has(b)) out.set(key, value);
    });
    return out;
};
