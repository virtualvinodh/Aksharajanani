import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { KerningMap } from '../types';

type KerningState = {
    kerningMap: KerningMap;
};

type KerningAction =
    | { type: 'SET_MAP'; payload: KerningMap }
    | { type: 'RESET' };

const kerningReducer = (state: KerningState, action: KerningAction): KerningState => {
    switch (action.type) {
        case 'SET_MAP':
            return { ...state, kerningMap: action.payload };
        case 'RESET':
            return { ...state, kerningMap: new Map() };
        default:
            return state;
    }
};

interface KerningContextType {
    kerningMap: KerningMap;
    dispatch: Dispatch<KerningAction>;
}

const KerningContext = createContext<KerningContextType | undefined>(undefined);

const initialState: KerningState = {
    kerningMap: new Map(),
};

export const KerningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(kerningReducer, initialState);

    const value = useMemo(() => ({
        kerningMap: state.kerningMap,
        dispatch,
    }), [state.kerningMap]);

    return (
        <KerningContext.Provider value={value}>
            {children}
        </KerningContext.Provider>
    );
};

export const useKerning = (): KerningContextType => {
    const context = useContext(KerningContext);
    if (context === undefined) {
        throw new Error('useKerning must be used within a KerningProvider');
    }
    return context;
};
