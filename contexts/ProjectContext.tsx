
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback } from 'react';
import { 
    GlyphData, KerningMap, CharacterSet, Path, 
    ProjectData, ScriptConfig, AppSettings, FontMetrics, Character,
    PositioningRules, MarkAttachmentRules, AttachmentClass, RecommendedKerning,
    GuideFont
} from '../types';

// --- Types moved from CharacterContext ---
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

interface ProjectContextType {
    script: ScriptConfig | null;
    glyphDataMap: Map<number, GlyphData>;
    setGlyphDataMap: React.Dispatch<React.SetStateAction<Map<number, GlyphData>>>;
    kerningMap: KerningMap;
    setKerningMap: React.Dispatch<React.SetStateAction<KerningMap>>;
    characterSets: CharacterSet[] | null;
    setCharacterSets: React.Dispatch<React.SetStateAction<CharacterSet[] | null>>;
    clipboard: Path[] | null;
    setClipboard: React.Dispatch<React.SetStateAction<Path[] | null>>;
    settings: AppSettings | null;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
    metrics: FontMetrics | null;
    setMetrics: React.Dispatch<React.SetStateAction<FontMetrics | null>>;
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

    // Dispatcher for character actions
    dispatchCharacterAction: (action: CharacterAction) => void;
    // Alias for backward compatibility with components previously using CharacterContext
    dispatch: (action: CharacterAction) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [script, setScript] = useState<ScriptConfig | null>(null);
    const [glyphDataMap, setGlyphDataMap] = useState<Map<number, GlyphData>>(new Map());
    const [kerningMap, setKerningMap] = useState<KerningMap>(new Map());
    const [characterSets, setCharacterSets] = useState<CharacterSet[] | null>(null);
    const [clipboard, setClipboard] = useState<Path[] | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [metrics, setMetrics] = useState<FontMetrics | null>(null);
    const [projectDataToRestore, setProjectDataToRestore] = useState<ProjectData | null>(null);
    const [projectName, setProjectName] = useState<string>('My Project');

    // New Unified Data Fields
    const [positioningRules, setPositioningRules] = useState<PositioningRules[] | null>(null);
    const [markAttachmentRules, setMarkAttachmentRules] = useState<MarkAttachmentRules | null>(null);
    const [markAttachmentClasses, setMarkAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [baseAttachmentClasses, setBaseAttachmentClasses] = useState<AttachmentClass[] | null>(null);
    const [recommendedKerning, setRecommendedKerning] = useState<RecommendedKerning[] | null>(null);
    const [guideFont, setGuideFont] = useState<GuideFont | null>(null);

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
            case 'UPDATE_CHARACTER_BEARINGS':
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
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
                });
                break;
            case 'ADD_CHARACTERS': 
                setCharacterSets(prev => {
                    const { characters, activeTabNameKey } = action.payload;
                    if (!characters || characters.length === 0) return prev;
                    const currentSets = prev || [];
                    const newSets: CharacterSet[] = JSON.parse(JSON.stringify(currentSets));
                    
                    let targetSet = newSets.find(s => s.nameKey === activeTabNameKey);
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
                    return newSets;
                });
                break;
            case 'UNLINK_GLYPH':
                setCharacterSets(prev => {
                    if (!prev) return null;
                    return prev.map(set => ({
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
                                newChar.link = newChar.sourceLink;
                                delete newChar.sourceLink;
                                delete newChar.composite;
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
        glyphDataMap, setGlyphDataMap,
        kerningMap, setKerningMap,
        characterSets, setCharacterSets,
        clipboard, setClipboard,
        settings, setSettings,
        metrics, setMetrics,
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
