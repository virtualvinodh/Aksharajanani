
import React from 'react';
import { useProject } from './ProjectContext';
import { CharacterSet, ScriptConfig, Character } from '../types';

// Interface kept for compatibility with existing components
interface CharacterContextType {
    script: ScriptConfig | null;
    characterSets: CharacterSet[] | null;
    dispatch: (action: any) => void;
    allCharsByUnicode: Map<number, Character>;
    allCharsByName: Map<string, Character>;
}

// Deprecated: CharacterProvider is no longer needed as state is hoisted to ProjectProvider.
// We keep a dummy render here just in case it's still imported somewhere, but it just renders children.
export const CharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <>{children}</>;
};

export const useCharacter = (): CharacterContextType => {
    const { 
        script, 
        characterSets, 
        dispatchCharacterAction, 
        allCharsByUnicode, 
        allCharsByName 
    } = useProject();

    return {
        script,
        characterSets,
        dispatch: dispatchCharacterAction,
        allCharsByUnicode,
        allCharsByName,
    };
};
