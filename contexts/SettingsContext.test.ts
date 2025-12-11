
import { describe, it, expect } from 'vitest';
import { AppSettings, FontMetrics } from '../types';

// Replicating reducer for testing logic
type SettingsState = {
    settings: AppSettings | null;
    metrics: FontMetrics | null;
};

const settingsReducer = (state: SettingsState, action: any): SettingsState => {
    switch(action.type) {
        case 'SET_SETTINGS': return { ...state, settings: action.payload };
        case 'UPDATE_SETTINGS': return { ...state, settings: action.payload(state.settings) };
        case 'SET_METRICS': return { ...state, metrics: action.payload };
        case 'RESET': return { settings: null, metrics: null };
        default: return state;
    }
};

describe('settingsReducer', () => {
    const initialState: SettingsState = { settings: null, metrics: null };
    const mockSettings: AppSettings = { fontName: 'Test', strokeThickness: 10, pathSimplification: 0, contrast: 1, showGridOutlines: true, isAutosaveEnabled: true, editorMode: 'simple', isPrefillEnabled: true, showHiddenGlyphs: false, showUnicodeValues: false };

    it('SET_SETTINGS updates settings', () => {
        const newState = settingsReducer(initialState, { type: 'SET_SETTINGS', payload: mockSettings });
        expect(newState.settings).toEqual(mockSettings);
    });

    it('UPDATE_SETTINGS works with functional update', () => {
        const stateWithSettings = { ...initialState, settings: mockSettings };
        const newState = settingsReducer(stateWithSettings, { 
            type: 'UPDATE_SETTINGS', 
            payload: (prev: AppSettings) => ({ ...prev, strokeThickness: 20 }) 
        });
        expect(newState.settings?.strokeThickness).toBe(20);
        expect(newState.settings?.fontName).toBe('Test');
    });

    it('SET_METRICS updates metrics', () => {
        const metrics: FontMetrics = { unitsPerEm: 1000, ascender: 800, descender: -200, defaultAdvanceWidth: 500, topLineY: 200, baseLineY: 600, styleName: 'Regular', spaceAdvanceWidth: 200, defaultLSB: 10, defaultRSB: 10 };
        const newState = settingsReducer(initialState, { type: 'SET_METRICS', payload: metrics });
        expect(newState.metrics).toEqual(metrics);
    });
});
