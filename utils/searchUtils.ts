
import { Character } from '../types';

export interface SearchQuery {
    raw: string;
    lower: string;
    unicodeHex: string | null;
    exactMatch: string | null;
    isEffective: boolean;
}

/**
 * Parses a raw search string into a structured query object.
 * Supports "Exact Match" quotes and U+XXXX / 0xXXXX unicode syntax.
 */
export const parseSearchQuery = (query: string): SearchQuery => {
    const raw = query.trim();
    if (!raw) {
        return { raw: '', lower: '', unicodeHex: null, exactMatch: null, isEffective: false };
    }

    const lower = raw.toLowerCase();
    
    // Check for Unicode syntax: U+1234 or 0x1234 (case insensitive)
    const unicodeMatch = raw.match(/^(?:u\+|0x)([0-9a-f]+)$/i);
    const unicodeHex = unicodeMatch ? unicodeMatch[1].toUpperCase() : null;

    // Check for Exact Match syntax: "A" or 'A'
    const quoteMatch = raw.match(/^["'](.*)["']$/);
    const exactMatch = quoteMatch ? quoteMatch[1] : null;

    return {
        raw,
        lower,
        unicodeHex,
        exactMatch,
        isEffective: true
    };
};

/**
 * Calculates a match score for a character against a parsed query.
 * Lower score is better/more relevant.
 * Returns -1 if no match.
 * 
 * Score Tiers:
 * 1: Exact Name Match / Exact Unicode Match
 * 2: Starts With Name
 * 3: Contains Name
 * 4: Partial Unicode Match
 */
export const getCharacterMatchScore = (char: Character, q: SearchQuery): number => {
    if (!q.isEffective) return 0;

    // 1. Unicode Search Strategy
    if (q.unicodeHex) {
        if (char.unicode !== undefined) {
            const charHex = char.unicode.toString(16).toUpperCase().padStart(4, '0');
            if (charHex === q.unicodeHex) return 1; // Exact Unicode match
            if (charHex.startsWith(q.unicodeHex)) return 4; // Partial Unicode match
        }
        return -1;
    }

    // 2. Exact Name Strategy (Quoted)
    if (q.exactMatch) {
        // Strict case-sensitive match for quoted strings
        return char.name === q.exactMatch ? 1 : -1;
    }

    // 3. Fuzzy Name Strategy
    const nameLower = char.name.toLowerCase();
    
    if (nameLower === q.lower) return 1; // Exact match (case-insensitive)
    if (nameLower.startsWith(q.lower)) return 2; // Starts with
    if (nameLower.includes(q.lower)) return 3; // Contains

    return -1;
};

/**
 * Filters and sorts an array of characters based on the smart search logic.
 */
export const filterAndSortCharacters = (characters: Character[], query: string): Character[] => {
    const q = parseSearchQuery(query);
    if (!q.isEffective) return characters;

    // Filter and Score
    const matches = characters.map(char => ({
        char,
        score: getCharacterMatchScore(char, q)
    })).filter(item => item.score > 0);

    // Sort
    matches.sort((a, b) => {
        // Priority 1: Match Score (Lower is better)
        if (a.score !== b.score) return a.score - b.score;

        // Priority 2: Name Length (Shorter is usually more relevant, e.g. "A" vs "Alpha")
        if (a.char.name.length !== b.char.name.length) return a.char.name.length - b.char.name.length;

        // Priority 3: Unicode Order (Stability)
        return (a.char.unicode || 0) - (b.char.unicode || 0);
    });

    return matches.map(m => m.char);
};
