import { describe, it, expect } from 'vitest';
import { layerByDependency } from './feaService';

describe('layerByDependency', () => {
    it('puts a ligature after the ligature it is built from', () => {
        // Malayalam: റ്റ = റ ് റ, then സ്റ്റ = സ ് റ്റ. In one lookup സ്റ്റ never formed.
        const tta = { input: ['റ', '്', 'റ'], output: 'റ്റ' };
        const stta = { input: ['സ', '്', 'റ്റ'], output: 'സ്റ്റ' };
        const kka = { input: ['ക', '്', 'ക'], output: 'ക്ക' };
        expect(layerByDependency([stta, tta, kka])).toEqual([[tta, kka], [stta]]);
    });

    it('chains deeper and survives a cycle', () => {
        const a = { input: ['x', 'y'], output: 'A' };
        const b = { input: ['A', 'z'], output: 'B' };
        const c = { input: ['B', 'w'], output: 'C' };
        expect(layerByDependency([c, b, a]).map(l => l.map(r => r.output))).toEqual([['A'], ['B'], ['C']]);
        const p = { input: ['Q'], output: 'P' }, q = { input: ['P'], output: 'Q' };
        expect(layerByDependency([p, q]).flat()).toHaveLength(2);
    });
});
