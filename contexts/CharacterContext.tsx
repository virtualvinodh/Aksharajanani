

import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch } from 'react';
import { CharacterSet, ScriptConfig, Character } from '../types';

type CharacterState = {
    script: ScriptConfig | null;
    characterSets: CharacterSet[] | null;
};

type CharacterAction =
    | { type: 'SET_SCRIPT'; payload: ScriptConfig | null }
    | { type: 'SET_CHARACTER_SETS'; payload: CharacterSet[] | null }
    | { type: 'UPDATE_CHARACTER_SETS', payload: (prev: CharacterSet[] | null) => CharacterSet[] | null }
    | { type: 'DELETE_CHARACTER', payload: { unicode: number } }
    | { type: 'UPDATE_CHARACTER_BEARINGS', payload: { unicode: number, lsb?: number, rsb?: number } }
    | { type: 'ADD_CHARACTERS', payload: { characters: Character[], activeTabNameKey: string } }
    | { type: 'UNLINK_GLYPH', payload: { unicode: number } }
    | { type: 'RELINK_GLYPH', payload: { unicode: number } }
    | { type: 'RESET' };

const characterReducer = (state: CharacterState, action: CharacterAction): CharacterState => {
    switch (action.type) {
        case 'SET_SCRIPT': return { ...state, script: action.payload };
        case 'SET_CHARACTER_SETS': return { ...state, characterSets: action.payload };
        case 'UPDATE_CHARACTER_SETS': return { ...state, characterSets: action.payload(state.characterSets) };
        case 'DELETE_CHARACTER': {
            if (!state.characterSets) return state;
            const newSets = state.characterSets
                .map(s => ({ ...s, characters: s.characters.filter(c => c.unicode !== action.payload.unicode) }))
                .filter(s => s.characters.length > 0);
            return { ...state, characterSets: newSets };
        }
        case 'UPDATE_CHARACTER_BEARINGS': {
            if (!state.characterSets) return state;
            const newSets = state.characterSets.map(set => ({
                ...set,
                characters: set.characters.map(char => {
                    if (char.unicode === action.payload.unicode) {
                        const newChar = { ...char };
                        if (action.payload.lsb !== undefined) newChar.lsb = action.payload.lsb; else delete newChar.lsb;
                        if (action.payload.rsb !== undefined) newChar.rsb = action.payload.rsb; else delete newChar.rsb;
                        return newChar;
                    }
                    return char;
                })
            }));
            return { ...state, characterSets: newSets };
        }
        case 'ADD_CHARACTERS': {
            const { characters, activeTabNameKey } = action.payload;
            if (!characters || characters.length === 0) return state;
            const currentSets = state.characterSets || [];
            const newSets: CharacterSet[] = JSON.parse(JSON.stringify(currentSets));
            
            let targetSet = newSets.find(s => s.nameKey === activeTabNameKey);

            // Fallback if target set not found (e.g., if there are no sets yet, or nameKey is default)
            if (!targetSet) {
                const TARGET_SET_KEY = 'punctuationsAndOthers';
                targetSet = newSets.find(s => s.nameKey === TARGET_SET_KEY);
                if (!targetSet) {
                    targetSet = { nameKey: TARGET_SET_KEY, characters: [] };
                    newSets.push(targetSet);
                }
            }
            
            const existingUnicodes = new Set(newSets.flatMap(s => s.characters).map(c => c.unicode));
            
            characters.forEach(charToAdd => {
                if (charToAdd.unicode !== undefined && !existingUnicodes.has(charToAdd.unicode)) {
                    targetSet!.characters.push(charToAdd);
                    existingUnicodes.add(charToAdd.unicode);
                }
            });
            
            return { ...state, characterSets: newSets };
        }
        case 'UNLINK_GLYPH': {
            if (!state.characterSets) return state;
            return {
                ...state,
                characterSets: state.characterSets.map(set => ({
                    ...set,
                    characters: set.characters.map(char => {
                        if (char.unicode === action.payload.unicode && char.link) {
                            const newChar = { ...char };
                            newChar.composite = newChar.link;
                            newChar.sourceLink = newChar.link;
                            delete newChar.link;
                            return newChar;
                        }
                        return char;
                    })
                }))
            };
        }
        case 'RELINK_GLYPH': {
            if (!state.characterSets) return state;
            return {
                ...state,
                characterSets: state.characterSets.map(set => ({
                    ...set,
                    characters: set.characters.map(char => {
                        if (char.unicode === action.payload.unicode && char.sourceLink) {
                            const newChar = { ...char };
                            newChar.link = newChar.sourceLink;
                            delete newChar.sourceLink;
                            delete newChar.composite;
                            return newChar;
                        }
                        return char;
                    })
                }))
            };
        }
        case 'RESET': return { ...initialState };
        default: return state;
    }
};

interface CharacterContextType {
    script: ScriptConfig | null;
    characterSets: CharacterSet[] | null;
    dispatch: Dispatch<CharacterAction>;
    allCharsByUnicode: Map<number, Character>;
    allCharsByName: Map<string, Character>;
}

const CharacterContext = createContext<CharacterContextType | undefined>(undefined);

const initialState: CharacterState = {
    script: null,
    characterSets: null,
};

export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(characterReducer, initialState);

    const allCharsByUnicode = useMemo(() => {
        if (!state.characterSets) return new Map<number, Character>();
        const map = new Map<number, Character>();
        state.characterSets.flatMap(set => set.characters).forEach(char => {
          if (char.unicode !== undefined) {
            map.set(char.unicode, char);
          }
        });
        return map;
    }, [state.characterSets]);

    const allCharsByName = useMemo(() => {
        if (!state.characterSets) return new Map<string, Character>();
        const map = new Map<string, Character>();
        state.characterSets.flatMap(set => set.characters).forEach(char => map.set(char.name, char));
        return map;
    }, [state.characterSets]);
    
    const value = useMemo(() => ({
        script: state.script,
        characterSets: state.characterSets,
        dispatch,
        allCharsByUnicode,
        allCharsByName,
    }), [state.script, state.characterSets, allCharsByUnicode, allCharsByName]);

    return (
        <CharacterContext.Provider value={value}>
            {children}
        </CharacterContext.Provider>
    );
};

export const useCharacter = (): CharacterContextType => {
    const context = useContext(CharacterContext);
    if (context === undefined) {
        throw new Error('useCharacter must be used within a CharacterProvider');
    }
    return context;
};