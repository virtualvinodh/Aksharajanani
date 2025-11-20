
import { describe, it, expect } from 'vitest';
import { glyphDataReducer, GlyphDataAction } from './GlyphDataContext';
import { GlyphData } from '../types';

describe('glyphDataReducer', () => {
    const initialState = { glyphDataMap: new Map<number, GlyphData>() };

    it('SET_MAP replaces the entire map', () => {
        const newMap = new Map<number, GlyphData>();
        newMap.set(65, { paths: [] });
        
        const action: GlyphDataAction = { type: 'SET_MAP', payload: newMap };
        const newState = glyphDataReducer(initialState, action);
        
        expect(newState.glyphDataMap).toBe(newMap);
        expect(newState.glyphDataMap.has(65)).toBe(true);
    });

    it('RESET clears the map', () => {
        const startingMap = new Map<number, GlyphData>();
        startingMap.set(65, { paths: [] });
        const startingState = { glyphDataMap: startingMap };

        const action: GlyphDataAction = { type: 'RESET' };
        const newState = glyphDataReducer(startingState, action);

        expect(newState.glyphDataMap.size).toBe(0);
    });

    it('DELETE_GLYPH removes specific entry', () => {
        const startingMap = new Map<number, GlyphData>();
        startingMap.set(65, { paths: [{ id: 'p1', type: 'pen', points: [] }] }); // A
        startingMap.set(66, { paths: [] }); // B
        const startingState = { glyphDataMap: startingMap };

        const action: GlyphDataAction = { type: 'DELETE_GLYPH', payload: { unicode: 65 } };
        const newState = glyphDataReducer(startingState, action);

        expect(newState.glyphDataMap.has(65)).toBe(false);
        expect(newState.glyphDataMap.has(66)).toBe(true);
        // Ensure immutability: original map should not be modified if the reducer follows react patterns
        // The implementation uses `const newMap = new Map(state.glyphDataMap)`, so it is immutable.
        expect(startingMap.has(65)).toBe(true); 
    });

    it('UPDATE_MAP correctly applies transformation', () => {
        const startingMap = new Map<number, GlyphData>();
        startingMap.set(65, { paths: [] });
        const startingState = { glyphDataMap: startingMap };

        const action: GlyphDataAction = { 
            type: 'UPDATE_MAP', 
            payload: (prev) => {
                const n = new Map(prev);
                n.set(66, { paths: [] }); // Add B
                return n;
            } 
        };
        const newState = glyphDataReducer(startingState, action);

        expect(newState.glyphDataMap.has(65)).toBe(true);
        expect(newState.glyphDataMap.has(66)).toBe(true);
    });
});
