import React, { createContext, useState, useContext, ReactNode, useMemo } from 'react';
import { 
    GlyphData, KerningMap, CharacterSet, Path, 
    ProjectData, ScriptConfig, AppSettings, FontMetrics, Character 
} from '../types';

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

    const allCharsByUnicode = useMemo(() => {
        if (!characterSets) return new Map<number, Character>();
        const map = new Map<number, Character>();
        characterSets.flatMap(set => set.characters).forEach(char => map.set(char.unicode, char));
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
