
import { describe, it, expect } from 'vitest';
import { rulesReducer, initialRulesState, RulesState } from './rulesReducer';

describe('rulesReducer', () => {
    const initialState: RulesState = initialRulesState;

    it('SET_FONT_RULES updates rules', () => {
        const rules = { test: 123 };
        const newState = rulesReducer(initialState, { type: 'SET_FONT_RULES', payload: rules });
        expect(newState.fontRules).toEqual(rules);
    });

    it('SET_FEA_EDIT_MODE toggles mode', () => {
        const newState = rulesReducer(initialState, { type: 'SET_FEA_EDIT_MODE', payload: true });
        expect(newState.isFeaEditMode).toBe(true);
    });

    it('SET_MANUAL_FEA_CODE updates code', () => {
        const code = "feature liga { ... }";
        const newState = rulesReducer(initialState, { type: 'SET_MANUAL_FEA_CODE', payload: code });
        expect(newState.manualFeaCode).toBe(code);
    });

    it('RESET restores initial state', () => {
        const modifiedState = { ...initialState, isFeaEditMode: true, manualFeaCode: 'abc' };
        const newState = rulesReducer(modifiedState, { type: 'RESET' });
        expect(newState).toEqual(initialState);
    });
});
