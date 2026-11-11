/**
 * Code points for positioned pairs that have no saved glyph yet (K8). They used to come from a
 * counter that restarted on every recompute (and a second, separate counter in the editor modal),
 * so a new pair could take the code point of a pair already saved in the project, and the same
 * pair could get different code points in different screens. This derives the code point from
 * the pair and skips any code point already taken, so it's the same everywhere.
 */
const VIRTUAL_START = 0x100000;
const VIRTUAL_SPAN = 0xFFFD; // plane 16 private use: U+100000–U+10FFFC

export const createVirtualCodePointAllocator = (takenCodePoints: Iterable<number | undefined>) => {
    const taken = new Set<number>();
    for (const cp of takenCodePoints) if (cp !== undefined) taken.add(cp);
    return (baseUnicode: number, markUnicode: number): number => {
        let slot = ((baseUnicode * 65599 + markUnicode) >>> 0) % VIRTUAL_SPAN;
        for (let tries = 0; tries < VIRTUAL_SPAN && taken.has(VIRTUAL_START + slot); tries++) {
            slot = (slot + 1) % VIRTUAL_SPAN;
        }
        const cp = VIRTUAL_START + slot;
        taken.add(cp);
        return cp;
    };
};
