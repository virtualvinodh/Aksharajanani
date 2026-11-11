import { describe, it, expect } from 'vitest';
import { resolveRecommendedTarget } from './kerningService';
import { Character, RecommendedKerning } from '../types';

const metrics = { defaultLSB: 50, defaultRSB: 60 };
const A: Character = { name: 'A', unicode: 65, rsb: 30 };
const V: Character = { name: 'V', unicode: 86, lsb: 20 };
const o: Character = { name: 'o', unicode: 111 };
const groups = { caps: ['A', 'V'] };

describe('resolveRecommendedTarget (K5)', () => {
    it('treats a missing or null target as "use the default", not 0', () => {
        expect(resolveRecommendedTarget(A, V, [['A', 'V']], metrics)).toEqual({ rule: true, target: null });
        expect(resolveRecommendedTarget(A, V, [['A', 'V', null as unknown as string]], metrics)).toEqual({ rule: true, target: null });
    });
    it('keeps 0 as "kern until touching" and numbers as the gap', () => {
        expect(resolveRecommendedTarget(A, V, [['A', 'V', 0]], metrics).target).toBe(0);
        expect(resolveRecommendedTarget(A, V, [['A', 'V', '0']], metrics).target).toBe(0);
        expect(resolveRecommendedTarget(A, V, [['A', 'V', '10']], metrics).target).toBe(10);
    });
    it('reads lsb/rsb from the glyphs, falling back to the defaults', () => {
        expect(resolveRecommendedTarget(A, V, [['A', 'V', 'lsb']], metrics).target).toBe(20);
        expect(resolveRecommendedTarget(A, V, [['A', 'V', 'rsb']], metrics).target).toBe(30);
        expect(resolveRecommendedTarget(o, o, [['o', 'o', 'rsb']], metrics).target).toBe(60);
    });
    it('matches $group rules, with an exact pair rule taking precedence', () => {
        const rules: RecommendedKerning[] = [['$caps', 'o', '15'], ['A', 'o', '5']];
        expect(resolveRecommendedTarget(V, o, rules, metrics, { groups, characterSets: [] }).target).toBe(15);
        expect(resolveRecommendedTarget(A, o, rules, metrics, { groups, characterSets: [] }).target).toBe(5);
        expect(resolveRecommendedTarget(V, o, rules, metrics).rule).toBe(false); // no group context: exact only
    });
    it('reports when no rule covers the pair', () => {
        expect(resolveRecommendedTarget(o, A, [['A', 'V']], metrics)).toEqual({ rule: false, target: null });
        expect(resolveRecommendedTarget(o, A, null, metrics)).toEqual({ rule: false, target: null });
    });
});
