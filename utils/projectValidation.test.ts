import { describe, it, expect } from 'vitest';
import { validateProjectData } from './projectValidation';

const ok = { settings: { fontName: 'X' }, metrics: { unitsPerEm: 1000 }, glyphs: [[65, { paths: [] }]], characterSets: [{ nameKey: 'a', characters: [] }] };

describe('validateProjectData (P6)', () => {
    it('accepts a normal project and a minimal one', () => {
        expect(validateProjectData(ok)).toBeNull();
        expect(validateProjectData({ settings: {} })).toBeNull();
    });
    it('rejects things that are not projects', () => {
        expect(validateProjectData(null)).not.toBeNull();
        expect(validateProjectData([])).not.toBeNull();
        expect(validateProjectData('x')).not.toBeNull();
    });
    it('rejects a project without settings (used to throw after the open project was cleared)', () => {
        expect(validateProjectData({ glyphs: [] })).toMatch(/settings/);
    });
    it('rejects malformed lists', () => {
        expect(validateProjectData({ ...ok, glyphs: {} })).toMatch(/glyphs/);
        expect(validateProjectData({ ...ok, kerning: [[1, 2, 3]] })).toMatch(/kerning/);
        expect(validateProjectData({ ...ok, characterSets: [{ nameKey: 'a' }] })).toMatch(/character set/);
    });
});
