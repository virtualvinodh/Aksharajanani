
import React, { createContext, useState, useContext, ReactNode, useMemo, useRef, useCallback } from 'react';
import { GlyphData } from '../types';

// State and Action Types
export type GlyphDataAction =
    | { type: 'SET_MAP'; payload: Map<number, GlyphData> }
    | { type: 'UPDATE_MAP'; payload: (prevMap: Map<number, GlyphData>) => Map<number, GlyphData> }
    | { type: 'SET_GLYPH'; payload: { unicode: number; data: GlyphData } }
    | { type: 'BATCH_UPDATE_GLYPHS'; payload: [number, GlyphData][] }
    | { type: 'DELETE_GLYPH'; payload: { unicode: number } }
    | { type: 'RESET' };

// Reducer for testing purposes (and potentially fallback)
export const glyphDataReducer = (state: { glyphDataMap: Map<number, GlyphData> }, action: GlyphDataAction): { glyphDataMap: Map<number, GlyphData> } => {
    switch (action.type) {
        case 'SET_MAP':
            return { glyphDataMap: action.payload };
        case 'UPDATE_MAP':
            return { glyphDataMap: action.payload(state.glyphDataMap) };
        case 'SET_GLYPH': {
            const newMap = new Map(state.glyphDataMap);
            newMap.set(action.payload.unicode, action.payload.data);
            return { glyphDataMap: newMap };
        }
        case 'BATCH_UPDATE_GLYPHS': {
            const newMap = new Map(state.glyphDataMap);
            action.payload.forEach(([unicode, data]) => {
                newMap.set(unicode, data);
            });
            return { glyphDataMap: newMap };
        }
        case 'DELETE_GLYPH': {
            const newMap = new Map(state.glyphDataMap);
            newMap.delete(action.payload.unicode);
            return { glyphDataMap: newMap };
        }
        case 'RESET':
            return { glyphDataMap: new Map() };
        default:
            return state;
    }
};

// Context
interface GlyphDataContextType {
    glyphDataMap: Map<number, GlyphData>;
    dispatch: (action: GlyphDataAction) => void;
    version: number;
}

const GlyphDataContext = createContext<GlyphDataContextType | undefined>(undefined);

export const GlyphDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Optimization: Store the heavy Map in a ref to avoid cloning it on every render/update
    const mapRef = useRef<Map<number, GlyphData>>(new Map());
    // Use a version counter to trigger re-renders when the map is mutated
    const [version, setVersion] = useState(0);

    const dispatch = useCallback((action: GlyphDataAction) => {
        let hasChanges = false;

        switch (action.type) {
            case 'SET_MAP':
                mapRef.current = action.payload;
                hasChanges = true;
                break;
            case 'UPDATE_MAP':
                // Legacy support for functional updates: creates a new Map
                mapRef.current = action.payload(mapRef.current);
                hasChanges = true;
                break;
            case 'SET_GLYPH':
                // Optimized single update: Mutate existing map
                mapRef.current.set(action.payload.unicode, action.payload.data);
                hasChanges = true;
                break;
            case 'BATCH_UPDATE_GLYPHS':
                // Optimized batch update: Mutate existing map
                action.payload.forEach(([unicode, data]) => {
                    mapRef.current.set(unicode, data);
                });
                hasChanges = true;
                break;
            case 'DELETE_GLYPH':
                if (mapRef.current.has(action.payload.unicode)) {
                    mapRef.current.delete(action.payload.unicode);
                    hasChanges = true;
                }
                break;
            case 'RESET':
                if (mapRef.current.size > 0) {
                    mapRef.current.clear();
                    hasChanges = true;
                }
                break;
        }

        if (hasChanges) {
            setVersion(v => v + 1);
        }
    }, []);

    const value = useMemo(() => ({
        glyphDataMap: mapRef.current,
        dispatch,
        version
    }), [version, dispatch]);

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
