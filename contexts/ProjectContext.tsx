
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback } from 'react';
import { 
    CharacterSet, ProjectData, ScriptConfig, Character,
    PositioningRules, MarkAttachmentRules, AttachmentClass, RecommendedKerning,
    GuideFont, ComponentTransform
} from '../types';

// --- Types moved from CharacterContext ---
type CharacterAction =
    | { type: 'SET_SCRIPT'; payload: ScriptConfig | null }
    | { type: 'SET_CHARACTER_SETS'; payload: CharacterSet[] | null }
    | { type: 'UPDATE_CHARACTER_SETS', payload: (prev: CharacterSet[] | null) => CharacterSet[] | null }
    | { type: 'DELETE_CHARACTER', payload: { unicode: number } }
    | { type: 'UPDATE_CHARACTER_METADATA', payload: { 
          unicode: number, 
          lsb?: number, rsb?: number, glyphClass?: Character['glyphClass'], advWidth?: number | string,
          label?: string,
          position?: [string, string], kern?: [string, string], link?: string[], composite?: string[], 
          liga?: string[],
          compositeTransform?: ComponentTransform[],
          gpos?: string, gsub?: string
      } }
    | { type: 'UPDATE_CHARACTER_BEARINGS', payload: { unicode: number, lsb?: number, rsb?: number } }
    | { type: 'ADD_CHARACTERS', payload: { characters: Character[], activeTabNameKey: string } }
    | { type: 'UNLINK_GLYPH', payload: { unicode: number, transforms?: ComponentTransform[] } }
    | { type: 'RELINK_GLYPH', payload: { unicode: number } }
    | { type: 'RESET' };

interface ProjectContextType {
    script: ScriptConfig | null;
    characterSets: CharacterSet[] | null;
    setCharacterSets: React.Dispatch<React.SetStateAction<CharacterSet[] | null>>;
    allCharsByUnicode: Map<number, Character>;
    allCharsByName: Map<string, Character>;
    projectDataToRestore: ProjectData | null;
    setProjectDataToRestore: React.Dispatch<React.SetStateAction<ProjectData | null>>;
    setScript: React.Dispatch<React.SetStateAction<ScriptConfig | null>>;
    projectName: string;
    setProjectName: React.Dispatch<React.SetStateAction<string>>;
    
    // New Unified Data Fields
    positioningRules: PositioningRules[] | null;
    setPositioningRules: React.Dispatch<React.SetStateAction<PositioningRules[] | null>>;
    markAttachmentRules: MarkAttachmentRules | null;
    setMarkAttachmentRules: React.Dispatch<React.SetStateAction<MarkAttachmentRules | null>>;
    markAttachmentClasses: AttachmentClass[] | null;
    setMarkAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[] | null>>;
    baseAttachmentClasses: AttachmentClass[] | null;
    setBaseAttachmentClasses: React.Dispatch<React.SetStateAction<AttachmentClass[] | null>>;
    recommendedKerning: RecommendedKerning[] | null;
    setRecommendedKerning: React.Dispatch<React.SetStateAction<RecommendedKerning[] | null>>;
    guideFont: GuideFont | null;
    setGuideFont: React.Dispatch<React.SetStateAction<GuideFont | null>>;
    
    // Edit Mode
    isEditMode: boolean;
    setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
    baseFontBinary: Uint8Array | undefined;
    setBaseFontBinary: React.Dispatch<React.SetStateAction<Uint8Array | undefined>>;

    // Track groups that belong to positioning to filter them in Rules UI
    positioningGroupNames: Set<string>;
    setPositioningGroupNames: React.Dispatch<React.SetStateAction<Set<string>>>;

    // Dispatcher for character actions
    dispatchCharacterAction: (action: CharacterAction) => void;
    // Alias for backward compatibility with components previously using CharacterContext
    dispatch: (action: CharacterAction) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [script, setScript] = useState<ScriptConfig | null>(null);
    const [characterSets, setCharacterSets] = useState<CharacterSet[] | null>(null);
    const [projectDataToRestore, setProjectDataToRestore] = useState<ProjectData | null>(null);
    const [projectName, setProjectName] = useState<string>('My Project');

    // New Unified Data Fields
    const [positioningRules, setPositioningRules] = useState<PositioningRules[] | null>(null);
    const [markAttachmentRules, setMarkAttachmentRules] = useState<MarkAttachmentRules | null>(null);
    const [markAttachmentClasses, setMarkAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [baseAttachmentClasses, setBaseAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [recommendedKerning, setRecommendedKerning] = useState<RecommendedKerning[] | null>(null);
    const [guideFont, setGuideFont] = useState<GuideFont | null>(null);
    const [positioningGroupNames, setPositioningGroupNames] = useState<Set<string>>(new Set());
    
    // Edit Mode
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [baseFontBinary, setBaseFontBinary] = useState<Uint8Array | undefined>(undefined);

    // Logic ported from CharacterContext reducer
    const dispatchCharacterAction = useCallback((action: CharacterAction) => {
        switch (action.type) {
            case 'SET_SCRIPT': 
                setScript(action.payload);
                break;
            case 'SET_CHARACTER_SETS': 
                setCharacterSets(action.payload);
                break;
            case 'UPDATE_CHARACTER_SETS': 
                setCharacterSets(prev => action.payload(prev));
                break;
            case 'DELETE_CHARACTER': 
                setCharacterSets(prev => {
                    if (!prev) return null;
                    const newSets = prev
                        .map(s => ({ ...s, characters: s.characters.filter(c => c.unicode !== action.payload.unicode) }))
                        .filter(s => s.characters.length > 0);
                    return newSets;
                });
                break;
            case 'UPDATE_CHARACTER_METADATA':
                console.log("PROJECT CONTEXT: Updating Metadata", action.payload);
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
                        ...set,
                        characters: set.characters.map(char => {
                            if (char.unicode === action.payload.unicode) {
                                const newChar = { ...char };
                                const p = action.payload;

                                // Helper to update or delete based on presence in payload
                                if ('lsb' in p) { if (p.lsb !== undefined) newChar.lsb = p.lsb; else delete newChar.lsb; }
                                if ('rsb' in p) { if (p.rsb !== undefined) newChar.rsb = p.rsb; else delete newChar.rsb; }
                                if ('glyphClass' in p) { if (p.glyphClass !== undefined) newChar.glyphClass = p.glyphClass; else delete newChar.glyphClass; }
                                if ('advWidth' in p) { if (p.advWidth !== undefined) newChar.advWidth = p.advWidth; else delete newChar.advWidth; }
                                if ('label' in p) { if (p.label !== undefined) newChar.label = p.label; else delete newChar.label; }

                                // Construction props
                                if ('position' in p) { if (p.position !== undefined) newChar.position = p.position; else delete newChar.position; }
                                if ('kern' in p) { if (p.kern !== undefined) newChar.kern = p.kern; else delete newChar.kern; }
                                if ('link' in p) { if (p.link !== undefined) newChar.link = p.link; else delete newChar.link; }
                                if ('composite' in p) { if (p.composite !== undefined) newChar.composite = p.composite; else delete newChar.composite; }
                                if ('liga' in p) { if (p.liga !== undefined) newChar.liga = p.liga; else delete newChar.liga; }
                                if ('compositeTransform' in p) { if (p.compositeTransform !== undefined) newChar.compositeTransform = p.compositeTransform; else delete newChar.compositeTransform; }
                                if ('gpos' in p) { if (p.gpos !== undefined) newChar.gpos = p.gpos; else delete newChar.gpos; }
                                if ('gsub' in p) { if (p.gsub !== undefined) newChar.gsub = p.gsub; else delete newChar.gsub; }

                                return newChar;
                            }
                            return char;
                        })
                    }));
                });
                break;
            case 'UPDATE_CHARACTER_BEARINGS':
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
                        ...set,
                        characters: set.characters.map(char => {
                            if (char.unicode === action.payload.unicode) {
                                const newChar = { ...char };
                                if (action.payload.lsb !== undefined) newChar.lsb = action.payload.lsb;
                                if (action.payload.rsb !== undefined) newChar.rsb = action.payload.rsb;
                                return newChar;
                            }
                            return char;
                        })
                    }));
                });
                break;
            case 'ADD_CHARACTERS': 
                setCharacterSets(prev => {
                    const { characters, activeTabNameKey } = action.payload;
                    if (!characters || characters.length === 0) return prev;
                    const currentSets = prev || [];
                    const newSets: CharacterSet[] = JSON.parse(JSON.stringify(currentSets));
                    
                    let targetSet = newSets.find(s => s.nameKey === activeTabNameKey);
                    
                    // If target set not found
                    if (!targetSet) {
                        // If a specific target name was requested (and isn't empty), create it.
                        if (activeTabNameKey && activeTabNameKey.trim() !== '') {
                            targetSet = { nameKey: activeTabNameKey, characters: [] };
                            newSets.push(targetSet);
                        } else {
                            // Fallback to "Punctuations & Others" if no specific target
                            const TARGET_SET_KEY = 'punctuationsAndOthers';
                            targetSet = newSets.find(s => s.nameKey === TARGET_SET_KEY);
                            if (!targetSet) {
                                targetSet = { nameKey: TARGET_SET_KEY, characters: [] };
                                newSets.push(targetSet);
                            }
                        }
                    }
                    const existingUnicodes = new Set(newSets.flatMap(s => s.characters).map(c => c.unicode));
                    characters.forEach(charToAdd => {
                        if (charToAdd.unicode !== undefined && !existingUnicodes.has(charToAdd.unicode)) {
                            targetSet!.characters.push(charToAdd);
                            existingUnicodes.add(charToAdd.unicode);
                        }
                    });
                    return newSets;
                });
                break;
            case 'UNLINK_GLYPH':
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
                        ...set,
                        characters: set.characters.map(char => {
                            if (char.unicode === action.payload.unicode) {
                                const newChar = { ...char };
                                
                                // Determine the type of link being broken
                                if (newChar.position) {
                                    newChar.sourceLink = newChar.position;
                                    newChar.sourceLinkType = 'position';
                                    newChar.composite = newChar.position; 
                                    delete newChar.position;
                                } else if (newChar.kern) {
                                    newChar.sourceLink = newChar.kern;
                                    newChar.sourceLinkType = 'kern';
                                    newChar.composite = newChar.kern;
                                    delete newChar.kern;
                                } else if (newChar.link) {
                                    newChar.sourceLink = newChar.link;
                                    newChar.sourceLinkType = 'link';
                                    newChar.composite = newChar.link; 
                                    delete newChar.link;
                                }

                                // Apply optional visual transforms passed from the hook calculation
                                if (action.payload.transforms) {
                                    newChar.compositeTransform = action.payload.transforms;
                                }
                                
                                return newChar;
                            }
                            return char;
                        })
                    }));
                });
                break;
            case 'RELINK_GLYPH':
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
                        ...set,
                        characters: set.characters.map(char => {
                            if (char.unicode === action.payload.unicode && char.sourceLink) {
                                const newChar = { ...char };
                                // Check stored type to decide restoration target
                                if (newChar.sourceLinkType === 'position') {
                                    newChar.position = newChar.sourceLink as [string, string];
                                } else if (newChar.sourceLinkType === 'kern') {
                                    newChar.kern = newChar.sourceLink as [string, string];
                                } else {
                                    // Default to standard link if type is 'link' or missing (legacy)
                                    newChar.link = newChar.sourceLink;
                                }
                                delete newChar.sourceLink;
                                delete newChar.sourceLinkType;
                                delete newChar.composite;
                                delete newChar.compositeTransform; // Clear manual edits
                                return newChar;
                            }
                            return char;
                        })
                    }));
                });
                break;
            case 'RESET':
                setScript(null);
                setCharacterSets(null);
                setPositioningGroupNames(new Set());
                setIsEditMode(false);
                setBaseFontBinary(undefined);
                break;
        }
    }, []);

    const allCharsByUnicode = useMemo(() => {
        if (!characterSets) return new Map<number, Character>();
        const map = new Map<number, Character>();
        characterSets.flatMap(set => set.characters).forEach(char => {
          if (char.unicode !== undefined) {
            map.set(char.unicode, char);
          }
        });
        return map;
    }, [characterSets]);

    const allCharsByName = useMemo(() => {
        if (!characterSets) return new Map<string, Character>();
        const map = new Map<string, Character>();
        characterSets.flatMap(set => set.characters).forEach(char => map.set(char.name, char));
        return map;
    }, [characterSets]);

    const value = {
        script, setScript,
        characterSets, setCharacterSets,
        allCharsByUnicode,
        allCharsByName,
        projectDataToRestore, setProjectDataToRestore,
        projectName, setProjectName,
        
        positioningRules, setPositioningRules,
        markAttachmentRules, setMarkAttachmentRules,
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses,
        recommendedKerning, setRecommendedKerning,
        guideFont, setGuideFont,
        positioningGroupNames, setPositioningGroupNames,
        
        isEditMode, setIsEditMode,
        baseFontBinary, setBaseFontBinary,

        dispatchCharacterAction,
        dispatch: dispatchCharacterAction // Alias for compatibility
    };

    return (
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = (): ProjectContextType => {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }
    return context;
};
