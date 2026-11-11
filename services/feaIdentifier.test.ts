import { describe, it, expect } from 'vitest';
import { feaIdentifier } from './feaService';

describe('feaIdentifier (E5)', () => {
    it('keeps valid ASCII names unchanged (existing fonts keep their class names)', () => {
        expect(feaIdentifier('consonants')).toBe('consonants');
        expect(feaIdentifier('sa_sha')).toBe('sa_sha');
        expect(feaIdentifier('my group')).toBe('my_group');
    });
    it('turns non-ASCII names into stable, readable ASCII', () => {
        const id = feaIdentifier('உயிர்');
        expect(id).toMatch(/^[A-Za-z0-9_.-]+$/);
        expect(id).toBe('n_x0B89_x0BAF_x0BBF_x0BB0_x0BCD');
        expect(feaIdentifier('உயிர்')).toBe(id);
    });
    it('keeps different names different', () => {
        expect(feaIdentifier('உயிர்')).not.toBe(feaIdentifier('மெய்'));
        expect(feaIdentifier('a+b')).not.toBe(feaIdentifier('ab'));
    });
    it('respects the 63-character FEA limit', () => {
        const long = 'உயிர்மெய்எழுத்துக்கள்_மிகவும்_நீளமான_பெயர்';
        expect(feaIdentifier(long).length).toBeLessThanOrEqual(63);
        expect(feaIdentifier(long)).not.toBe(feaIdentifier(long + 'x'));
    });
});
