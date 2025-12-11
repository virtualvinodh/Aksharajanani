
import { describe, it, expect } from 'vitest';
import { parseSearchQuery, getCharacterMatchScore } from './searchUtils';
import { Character } from '../types';

describe('searchUtils', () => {
    describe('parseSearchQuery', () => {
        it('parses basic text', () => {
            const result = parseSearchQuery('Test');
            expect(result.lower).toBe('test');
            expect(result.unicodeHex).toBeNull();
            expect(result.exactMatch).toBeNull();
            expect(result.isEffective).toBe(true);
        });

        it('parses Unicode U+ syntax', () => {
            const result = parseSearchQuery('U+0041');
            expect(result.unicodeHex).toBe('0041');
        });

        it('parses 0x syntax', () => {
            const result = parseSearchQuery('0x1F600');
            expect(result.unicodeHex).toBe('1F600');
        });

        it('parses exact match quotes', () => {
            const result = parseSearchQuery('"Space"');
            expect(result.exactMatch).toBe('Space');
        });
        
        it('handles empty input', () => {
            const result = parseSearchQuery('   ');
            expect(result.isEffective).toBe(false);
        });
    });

    describe('getCharacterMatchScore', () => {
        const charA: Character = { name: 'A', unicode: 65, glyphClass: 'base' };
        const charAlpha: Character = { name: 'Alpha', unicode: 913, glyphClass: 'base' };
        
        it('scores exact unicode match highest (via hex)', () => {
            const q = parseSearchQuery('U+0041');
            expect(getCharacterMatchScore(charA, q)).toBe(1);
        });

        it('scores exact name match via quotes highest', () => {
            const q = parseSearchQuery('"Alpha"');
            expect(getCharacterMatchScore(charAlpha, q)).toBe(1);
        });

        it('scores exact name match (case-insensitive) as 1', () => {
            const q = parseSearchQuery('alpha');
            expect(getCharacterMatchScore(charAlpha, q)).toBe(1);
        });

        it('scores "starts with" as 2', () => {
            const q = parseSearchQuery('Al');
            expect(getCharacterMatchScore(charAlpha, q)).toBe(2);
        });

        it('scores "contains" as 3', () => {
            const q = parseSearchQuery('ph');
            expect(getCharacterMatchScore(charAlpha, q)).toBe(3);
        });

        it('returns -1 for no match', () => {
            const q = parseSearchQuery('Beta');
            expect(getCharacterMatchScore(charAlpha, q)).toBe(-1);
        });
    });
});
