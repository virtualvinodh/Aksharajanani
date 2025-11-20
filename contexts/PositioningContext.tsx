import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { MarkPositioningMap } from '../types';

type PositioningState = {
    markPositioningMap: MarkPositioningMap;
};

type PositioningAction =
    | { type: 'SET_MAP'; payload: MarkPositioningMap }
    | { type: 'RESET' };

const positioningReducer = (state: PositioningState, action: PositioningAction): PositioningState => {
    switch (action.type) {
        case 'SET_MAP':
            return { ...state, markPositioningMap: action.payload };
        case 'RESET':
            return { ...state, markPositioningMap: new Map() };
        default:
            return state;
    }
};

interface PositioningContextType {
  markPositioningMap: MarkPositioningMap;
  dispatch: Dispatch<PositioningAction>;
}

const PositioningContext = createContext<PositioningContextType | undefined>(undefined);

const initialState: PositioningState = {
    markPositioningMap: new Map(),
};

export const PositioningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(positioningReducer, initialState);
    
    const value = useMemo(() => ({
        markPositioningMap: state.markPositioningMap,
        dispatch,
    }), [state.markPositioningMap]);

  return (
    <PositioningContext.Provider value={value}>
      {children}
    </PositioningContext.Provider>
  );
};

export const usePositioning = (): PositioningContextType => {
  const context = useContext(PositioningContext);
  if (context === undefined) {
    throw new Error('usePositioning must be used within a PositioningProvider');
  }
  return context;
};
