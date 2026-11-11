// The rules state reducer, kept outside RulesContext.tsx so it can be unit-tested directly
// (a .tsx module should only export components, for React Fast Refresh).

export type RulesState = {
  fontRules: any | null;
  isFeaEditMode: boolean;
  manualFeaCode: string;
  hasUnsavedRules: boolean;
};

export type RulesAction =
  | { type: 'SET_FONT_RULES'; payload: any | null }
  | { type: 'SET_FEA_EDIT_MODE'; payload: boolean }
  | { type: 'SET_MANUAL_FEA_CODE'; payload: string }
  | { type: 'SET_HAS_UNSAVED_RULES'; payload: boolean }
  | { type: 'RESET' };

export const rulesReducer = (state: RulesState, action: RulesAction): RulesState => {
    switch (action.type) {
        case 'SET_FONT_RULES': return { ...state, fontRules: action.payload };
        case 'SET_FEA_EDIT_MODE': return { ...state, isFeaEditMode: action.payload };
        case 'SET_MANUAL_FEA_CODE': return { ...state, manualFeaCode: action.payload };
        case 'SET_HAS_UNSAVED_RULES': return { ...state, hasUnsavedRules: action.payload };
        case 'RESET': return { ...initialRulesState };
        default: return state;
    }
};

export const initialRulesState: RulesState = {
    fontRules: null,
    isFeaEditMode: false,
    manualFeaCode: '',
    hasUnsavedRules: false,
};
