import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { rulesReducer, initialRulesState as initialState, RulesState, RulesAction } from './rulesReducer';

interface RulesContextType {
    state: RulesState;
    dispatch: Dispatch<RulesAction>;
}

const RulesContext = createContext<RulesContextType | undefined>(undefined);


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
