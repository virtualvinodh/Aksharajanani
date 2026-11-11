import { describe, it, expect } from 'vitest';
import { findCharacterLocations, restoreCharacters, pairEntriesInvolving } from './undoHelpers';
import { CharacterSet } from '../types';

const sets = (): CharacterSet[] => [
    { nameKey: 'vowels', characters: [{ unicode: 1, name: 'a' }, { unicode: 2, name: 'b' }, { unicode: 3, name: 'c' }] },
    { nameKey: 'marks', characters: [{ unicode: 9, name: 'm' }] },
];

describe('undo helpers (P13)', () => {
    it('puts a deleted character back in its old place', () => {
        const removed = findCharacterLocations(sets(), new Set([2]));
        const afterDelete: CharacterSet[] = [{ nameKey: 'vowels', characters: [{ unicode: 1, name: 'a' }, { unicode: 3, name: 'c' }] }, sets()[1]];
        expect(restoreCharacters(afterDelete, removed)[0].characters.map(c => c.name)).toEqual(['a', 'b', 'c']);
    });

    it('keeps edits made after the delete', () => {
        const removed = findCharacterLocations(sets(), new Set([2]));
        const edited: CharacterSet[] = [{ nameKey: 'vowels', characters: [{ unicode: 1, name: 'a', lsb: 77 }, { unicode: 3, name: 'c' }, { unicode: 4, name: 'new' }] }, sets()[1]];
        const restored = restoreCharacters(edited, removed);
        expect(restored[0].characters.map(c => c.name)).toEqual(['a', 'b', 'c', 'new']);
        expect(restored[0].characters[0].lsb).toBe(77);
    });

    it('recreates a set that became empty', () => {
        const removed = findCharacterLocations(sets(), new Set([9]));
        const restored = restoreCharacters([sets()[0]], removed);
        expect(restored.map(s => s.nameKey)).toEqual(['vowels', 'marks']);
        expect(restored[1].characters[0].name).toBe('m');
    });

    it('does not duplicate a character that exists again', () => {
        const removed = findCharacterLocations(sets(), new Set([2]));
        expect(restoreCharacters(sets(), removed)[0].characters).toHaveLength(3);
    });

    it('re-applies saved fields to other characters', () => {
        const restored = restoreCharacters(sets(), [], new Map([[3, { link: ['a'] }]]));
        expect(restored[0].characters[2].link).toEqual(['a']);
    });

    it('selects only the pairs that involve the given glyphs', () => {
        const m = new Map([['1-2', 10], ['3-4', 20], ['5-1', 30]]);
        expect([...pairEntriesInvolving(m, new Set([1])).keys()]).toEqual(['1-2', '5-1']);
    });
});
