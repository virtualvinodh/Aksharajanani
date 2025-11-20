import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { AppSettings, FontMetrics } from '../types';

type SettingsState = {
    settings: AppSettings | null;
    metrics: FontMetrics | null;
};

type SettingsAction =
    | { type: 'SET_SETTINGS'; payload: AppSettings | null }
    | { type: 'UPDATE_SETTINGS'; payload: (prev: AppSettings | null) => AppSettings | null }
    | { type: 'SET_METRICS'; payload: FontMetrics | null }
    | { type: 'UPDATE_METRICS'; payload: (prev: FontMetrics | null) => FontMetrics | null }
    | { type: 'RESET' };

const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
    switch(action.type) {
        case 'SET_SETTINGS': return { ...state, settings: action.payload };
        case 'UPDATE_SETTINGS': return { ...state, settings: action.payload(state.settings) };
        case 'SET_METRICS': return { ...state, metrics: action.payload };
        case 'UPDATE_METRICS': return { ...state, metrics: action.payload(state.metrics) };
        case 'RESET': return { ...initialState };
        default: return state;
    }
};

interface SettingsContextType {
    settings: AppSettings | null;
    metrics: FontMetrics | null;
    dispatch: Dispatch<SettingsAction>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const initialState: SettingsState = {
    settings: null,
    metrics: null,
};

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(settingsReducer, initialState);

    const value = useMemo(() => ({ 
        settings: state.settings,
        metrics: state.metrics,
        dispatch
    }), [state.settings, state.metrics]);
    
    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = (): SettingsContextType => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
