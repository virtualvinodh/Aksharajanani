import { describe, it, expect } from 'vitest';
import { createVirtualCodePointAllocator } from './virtualCodePoints';

describe('virtual code points (K8)', () => {
    it('gives the same pair the same code point every time', () => {
        const a = createVirtualCodePointAllocator([65, 66])(0x0B95, 0x0BC1);
        const b = createVirtualCodePointAllocator([65, 66])(0x0B95, 0x0BC1);
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0x100000);
        expect(a).toBeLessThanOrEqual(0x10FFFC);
    });
    it('never reuses a code point already in the project', () => {
        const first = createVirtualCodePointAllocator([])(0x0B95, 0x0BC1);
        const next = createVirtualCodePointAllocator([first])(0x0B95, 0x0BC1);
        expect(next).not.toBe(first);
    });
    it('gives different pairs different code points', () => {
        const alloc = createVirtualCodePointAllocator([]);
        const seen = new Set<number>();
        for (let b = 0x0B95; b < 0x0BB9; b++) for (let m = 0x0BBE; m < 0x0BCD; m++) seen.add(alloc(b, m));
        expect(seen.size).toBe((0x0BB9 - 0x0B95) * (0x0BCD - 0x0BBE));
    });
});
