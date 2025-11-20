import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';

type RulesState = {
  fontRules: any | null;
  isFeaEditMode: boolean;
  manualFeaCode: string;
  hasUnsavedRules: boolean;
};

type RulesAction =
  | { type: 'SET_FONT_RULES'; payload: any | null }
  | { type: 'SET_FEA_EDIT_MODE'; payload: boolean }
  | { type: 'SET_MANUAL_FEA_CODE'; payload: string }
  | { type: 'SET_HAS_UNSAVED_RULES'; payload: boolean }
  | { type: 'RESET' };

const rulesReducer = (state: RulesState, action: RulesAction): RulesState => {
    switch (action.type) {
        case 'SET_FONT_RULES': return { ...state, fontRules: action.payload };
        case 'SET_FEA_EDIT_MODE': return { ...state, isFeaEditMode: action.payload };
        case 'SET_MANUAL_FEA_CODE': return { ...state, manualFeaCode: action.payload };
        case 'SET_HAS_UNSAVED_RULES': return { ...state, hasUnsavedRules: action.payload };
        case 'RESET': return { ...initialState };
        default: return state;
    }
};

interface RulesContextType {
    state: RulesState;
    dispatch: Dispatch<RulesAction>;
}

const RulesContext = createContext<RulesContextType | undefined>(undefined);

const initialState: RulesState = {
    fontRules: null,
    isFeaEditMode: false,
    manualFeaCode: '',
    hasUnsavedRules: false,
};

export const RulesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(rulesReducer, initialState);

  const value = useMemo(() => ({
    state,
    dispatch
  }), [state]);

  return (
    <RulesContext.Provider value={value}>
      {children}
    </RulesContext.Provider>
  );
};

export const useRules = (): RulesContextType => {
  const context = useContext(RulesContext);
  if (context === undefined) {
    throw new Error('useRules must be used within a RulesProvider');
  }
  return context;
};
