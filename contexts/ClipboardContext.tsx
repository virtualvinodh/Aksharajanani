import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { Path } from '../types';

type ClipboardState = {
    clipboard: Path[] | null;
};

type ClipboardAction =
    | { type: 'SET_CLIPBOARD'; payload: Path[] | null }
    | { type: 'RESET' };

const clipboardReducer = (state: ClipboardState, action: ClipboardAction): ClipboardState => {
    switch (action.type) {
        case 'SET_CLIPBOARD':
            return { ...state, clipboard: action.payload };
        case 'RESET':
            return { ...state, clipboard: null };
        default:
            return state;
    }
};

interface ClipboardContextType {
    clipboard: Path[] | null;
    dispatch: Dispatch<ClipboardAction>;
}

const ClipboardContext = createContext<ClipboardContextType | undefined>(undefined);

const initialState: ClipboardState = {
    clipboard: null,
};

export const ClipboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(clipboardReducer, initialState);
    
    const value = useMemo(() => ({
        clipboard: state.clipboard,
        dispatch
    }), [state.clipboard]);
    
    return (
        <ClipboardContext.Provider value={value}>
            {children}
        </ClipboardContext.Provider>
    );
};

export const useClipboard = (): ClipboardContextType => {
    const context = useContext(ClipboardContext);
    if (context === undefined) {
        throw new Error('useClipboard must be used within a ClipboardProvider');
    }
    return context;
};
