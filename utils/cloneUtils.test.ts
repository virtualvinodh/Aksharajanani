
import { describe, it, expect } from 'vitest';
import { deepClone } from './cloneUtils';

describe('cloneUtils', () => {
    describe('deepClone', () => {
        it('clones primitives', () => {
            expect(deepClone(123)).toBe(123);
            expect(deepClone('test')).toBe('test');
            expect(deepClone(true)).toBe(true);
            expect(deepClone(null)).toBe(null);
        });

        it('deep clones simple objects', () => {
            const original = { a: 1, b: { c: 2 } };
            const clone = deepClone(original);
            expect(clone).toEqual(original);
            expect(clone).not.toBe(original);
            expect(clone.b).not.toBe(original.b);
        });

        it('deep clones arrays', () => {
            const original = [1, { a: 2 }];
            const clone = deepClone(original);
            expect(clone).toEqual(original);
            expect(clone).not.toBe(original);
            expect(clone[1]).not.toBe(original[1]);
        });

        it('clones Maps correctly', () => {
            const original = new Map();
            original.set('key', { value: 1 });
            const clone = deepClone(original);
            
            expect(clone).toBeInstanceOf(Map);
            expect(clone.size).toBe(1);
            expect(clone.get('key')).toEqual({ value: 1 });
            expect(clone.get('key')).not.toBe(original.get('key')); // Ensure deep copy of values if implementation supports it, mostly structuredClone does.
        });

        it('clones Sets correctly', () => {
            const original = new Set([1, 2, 3]);
            const clone = deepClone(original);
            
            expect(clone).toBeInstanceOf(Set);
            expect(clone.size).toBe(3);
            expect(clone.has(1)).toBe(true);
        });
    });
});
