
import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { GlyphData } from '../types';

// State and Action Types
type GlyphDataState = {
    glyphDataMap: Map<number, GlyphData>;
};

export type GlyphDataAction =
    | { type: 'SET_MAP'; payload: Map<number, GlyphData> }
    | { type: 'UPDATE_MAP'; payload: (prevMap: Map<number, GlyphData>) => Map<number, GlyphData> }
    | { type: 'DELETE_GLYPH'; payload: { unicode: number } }
    | { type: 'RESET' };

// Reducer
export const glyphDataReducer = (state: GlyphDataState, action: GlyphDataAction): GlyphDataState => {
    switch (action.type) {
        case 'SET_MAP':
            return { ...state, glyphDataMap: action.payload };
        case 'UPDATE_MAP':
            return { ...state, glyphDataMap: action.payload(state.glyphDataMap) };
        case 'DELETE_GLYPH': {
            const newMap = new Map(state.glyphDataMap);
            newMap.delete(action.payload.unicode);
            return { ...state, glyphDataMap: newMap };
        }
        case 'RESET':
            return { ...state, glyphDataMap: new Map() };
        default:
            return state;
    }
};

// Context
interface GlyphDataContextType {
    glyphDataMap: Map<number, GlyphData>;
    dispatch: Dispatch<GlyphDataAction>;
}

const GlyphDataContext = createContext<GlyphDataContextType | undefined>(undefined);

// Provider
const initialState: GlyphDataState = {
    glyphDataMap: new Map(),
};

export const GlyphDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(glyphDataReducer, initialState);

    const value = useMemo(() => ({
        glyphDataMap: state.glyphDataMap,
        dispatch,
    }), [state.glyphDataMap]);

    return (
        <GlyphDataContext.Provider value={value}>
            {children}
        </GlyphDataContext.Provider>
    );
};

// Hook
export const useGlyphData = (): GlyphDataContextType => {
    const context = useContext(GlyphDataContext);
    if (context === undefined) {
        throw new Error('useGlyphData must be used within a GlyphDataProvider');
    }
    return context;
};
