import { describe, it, expect } from 'vitest';
import { formatLookupFlags } from './feaService';

describe('formatLookupFlags (E6)', () => {
    it('keeps the shipped mark-filtering form unchanged', () => {
        expect(formatLookupFlags({ UseMarkFilteringSet: '@virama' })).toBe('  lookupflag UseMarkFilteringSet @virama;\n');
    });
    it('writes boolean flags as bare names (feaLib rejects "IgnoreMarks true")', () => {
        expect(formatLookupFlags({ IgnoreMarks: 'true' })).toBe('  lookupflag IgnoreMarks;\n');
        expect(formatLookupFlags({ IgnoreMarks: true })).toBe('  lookupflag IgnoreMarks;\n');
    });
    it('drops flags that are switched off', () => {
        expect(formatLookupFlags({ IgnoreMarks: 'false' })).toBe('');
        expect(formatLookupFlags({ IgnoreMarks: false, RightToLeft: '0' })).toBe('');
    });
    it('combines several flags into one statement', () => {
        expect(formatLookupFlags({ IgnoreLigatures: 'true', UseMarkFilteringSet: '$virama' }))
            .toBe('  lookupflag IgnoreLigatures UseMarkFilteringSet @virama;\n');
    });
    it('ignores unknown flags and missing class names', () => {
        expect(formatLookupFlags({ Bogus: 'true', UseMarkFilteringSet: '' })).toBe('');
        expect(formatLookupFlags(undefined)).toBe('');
    });
});
