
import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch, useEffect, useRef, useCallback } from 'react';
import { KerningMap, GlyphData, FontMetrics, AppSettings, Character } from '../types';
import { initAutoKernWorker, terminateAutoKernWorker } from '../services/autoKerningService';
import { useGlyphData } from './GlyphDataContext';
import { useSettings } from './SettingsContext';
import { useProject } from './ProjectContext';
import { isGlyphDrawn } from '../utils/glyphUtils';

type KerningState = {
    kerningMap: KerningMap;
    suggestedKerningMap: KerningMap;
    ignoredPairs: Set<string>;
};

type KerningAction =
    | { type: 'SET_MAP'; payload: KerningMap }
    | { type: 'BATCH_UPDATE'; payload: Map<string, number> }
    | { type: 'SET_SUGGESTIONS'; payload: Map<string, number> }
    | { type: 'MERGE_SUGGESTIONS'; payload: Map<string, number> }
    | { type: 'REMOVE_SUGGESTIONS'; payload: string[] }
    | { type: 'IGNORE_PAIR'; payload: string }
    | { type: 'UNIGNORE_PAIR'; payload: string }
    | { type: 'SET_IGNORED'; payload: Set<string> }
    | { type: 'RESET' };

const kerningReducer = (state: KerningState, action: KerningAction): KerningState => {
    switch (action.type) {
        case 'SET_MAP':
            return { ...state, kerningMap: action.payload };
        case 'BATCH_UPDATE': {
            const newMap = new Map(state.kerningMap);
            action.payload.forEach((val, key) => newMap.set(key, val));
            return { ...state, kerningMap: newMap };
        }
        case 'SET_SUGGESTIONS':
            return { ...state, suggestedKerningMap: action.payload };
        case 'MERGE_SUGGESTIONS':
            return {
                ...state,
                suggestedKerningMap: new Map([...state.suggestedKerningMap, ...action.payload])
            };
        case 'REMOVE_SUGGESTIONS': {
            const newMap = new Map(state.suggestedKerningMap);
            action.payload.forEach(key => newMap.delete(key));
            return { ...state, suggestedKerningMap: newMap };
        }
        case 'IGNORE_PAIR': {
            const newIgnored = new Set(state.ignoredPairs);
            newIgnored.add(action.payload);
            const newSuggested = new Map(state.suggestedKerningMap);
            newSuggested.delete(action.payload);
            return { ...state, ignoredPairs: newIgnored, suggestedKerningMap: newSuggested };
        }
        case 'UNIGNORE_PAIR': {
            const newIgnored = new Set(state.ignoredPairs);
            newIgnored.delete(action.payload);
            return { ...state, ignoredPairs: newIgnored };
        }
        case 'SET_IGNORED':
            return { ...state, ignoredPairs: action.payload };
        case 'RESET':
            return { ...state, kerningMap: new Map(), suggestedKerningMap: new Map(), ignoredPairs: new Set() };
        default:
            return state;
    }
};

export interface QueuedPair {
    left: Character;
    right: Character;
    targetDistance: number | null; // null = use defaults
}

interface KerningContextType {
    kerningMap: KerningMap;
    suggestedKerningMap: KerningMap;
    ignoredPairs: Set<string>;
    dispatch: Dispatch<KerningAction>;
    queueAutoKern: (pairs: QueuedPair[]) => void;
    discoverKerning: (onProgress: (p: number) => void, shouldCalculateValues: boolean, returnResultsOnly?: boolean) => Promise<Map<string, number>>;
}

const KerningContext = createContext<KerningContextType | undefined>(undefined);

const initialState: KerningState = {
    kerningMap: new Map(),
    suggestedKerningMap: new Map(),
    ignoredPairs: new Set(),
};

export const KerningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(kerningReducer, initialState);
    const { glyphDataMap } = useGlyphData();
    const { settings, metrics } = useSettings();
    const { characterSets } = useProject();

    const workerRef = useRef<Worker | null>(null);
    const pendingPairsRef = useRef<QueuedPair[]>([]);
    const debounceTimerRef = useRef<number | null>(null);
    const batchIdRef = useRef(0);
    
    // Discovery Refs
    const onDiscoveryProgressRef = useRef<((p: number) => void) | null>(null);
    const discoveryResolveRef = useRef<((results: Map<string, number>) => void) | null>(null);
    const shouldDispatchDiscoveryRef = useRef(true);
    
    // Initialize worker
    useEffect(() => {
        workerRef.current = initAutoKernWorker();
        
        workerRef.current.onmessage = (e) => {
            const { results, batchId: resultBatchId, type, progress } = e.data;
            
            if (type === 'progress') {
                 if (onDiscoveryProgressRef.current) {
                     onDiscoveryProgressRef.current(progress);
                 }
                 return;
            }

            const resultMap = new Map<string, number>();
            if (results && Object.keys(results).length > 0) {
                Object.entries(results).forEach(([key, val]) => resultMap.set(key, val as number));
                
                // Only dispatch if allowed (default true)
                if (shouldDispatchDiscoveryRef.current) {
                    dispatch({ type: 'MERGE_SUGGESTIONS', payload: resultMap });
                }
            }
            
            // If this was a discovery batch, resolve the promise with the map
            if (type === 'complete' && discoveryResolveRef.current) {
                 discoveryResolveRef.current(resultMap);
                 discoveryResolveRef.current = null;
                 onDiscoveryProgressRef.current = null;
                 shouldDispatchDiscoveryRef.current = true; // Reset
            }
        };

        return () => {
            terminateAutoKernWorker();
        };
    }, []);

    const processQueue = useCallback(() => {
        if (!workerRef.current || pendingPairsRef.current.length === 0 || !settings || !metrics) return;
        
        const batch = pendingPairsRef.current;
        pendingPairsRef.current = [];
        
        // Prepare data payload
        const relevantGlyphs: Record<string, GlyphData> = {};
        const pairPayloads = batch.map(p => {
             const lId = p.left.unicode!;
             const rId = p.right.unicode!;
             
             const lData = glyphDataMap.get(lId);
             const rData = glyphDataMap.get(rId);
             
             if (lData && rData) {
                 relevantGlyphs[lId] = lData;
                 relevantGlyphs[rId] = rData;
                 
                 return {
                     leftId: lId,
                     rightId: rId,
                     targetDistance: p.targetDistance,
                     leftRsb: p.left.rsb ?? metrics.defaultRSB,
                     rightLsb: p.right.lsb ?? metrics.defaultLSB
                 };
             }
             return null;
        }).filter(Boolean);

        if (pairPayloads.length > 0) {
            batchIdRef.current += 1;
            workerRef.current.postMessage({
                batchId: batchIdRef.current,
                pairs: pairPayloads,
                glyphDataMap: relevantGlyphs,
                metrics,
                strokeThickness: settings.strokeThickness
            });
        }
    }, [glyphDataMap, metrics, settings]);

    const queueAutoKern = useCallback((pairs: QueuedPair[]) => {
        if (!settings || !metrics) return;
        
        // Deduplicate and filter ignored
        const existingKeys = new Set(pendingPairsRef.current.map(p => `${p.left.unicode}-${p.right.unicode}`));
        const newPairs = pairs.filter(p => {
             const key = `${p.left.unicode}-${p.right.unicode}`;
             return !existingKeys.has(key) && !state.ignoredPairs.has(key);
        });
        
        if (newPairs.length > 0) {
            pendingPairsRef.current.push(...newPairs);
            
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = window.setTimeout(processQueue, 2000);
        }
    }, [processQueue, settings, metrics, state.ignoredPairs]);

    // NEW: Discovery Logic
    const discoverKerning = useCallback(async (onProgress: (p: number) => void, shouldCalculateValues: boolean, returnResultsOnly: boolean = false): Promise<Map<string, number>> => {
        if (!workerRef.current || !settings || !metrics || !characterSets) return new Map();
        
        onProgress(0); // Start
        
        const allDrawnChars: any[] = [];
        const relevantGlyphData: Record<string, GlyphData> = {};

        // 1. Gather all drawn base glyphs
        characterSets.flatMap(s => s.characters).forEach(char => {
             if (char.unicode && !char.hidden && (char.glyphClass === 'base' || !char.glyphClass)) {
                 const data = glyphDataMap.get(char.unicode);
                 if (isGlyphDrawn(data)) {
                     allDrawnChars.push({ 
                         unicode: char.unicode, 
                         lsb: char.lsb ?? metrics.defaultLSB, 
                         rsb: char.rsb ?? metrics.defaultRSB,
                         name: char.name
                     });
                     relevantGlyphData[char.unicode] = data!;
                 }
             }
        });
        
        return new Promise((resolve) => {
            onDiscoveryProgressRef.current = onProgress;
            discoveryResolveRef.current = resolve;
            shouldDispatchDiscoveryRef.current = !returnResultsOnly;
            
            batchIdRef.current += 1;
            workerRef.current!.postMessage({
                batchId: batchIdRef.current,
                type: 'discover',
                allGlyphDefs: allDrawnChars,
                glyphDataMap: relevantGlyphData,
                metrics,
                strokeThickness: settings.strokeThickness,
                shouldCalculateValues
            });
        });

    }, [characterSets, glyphDataMap, metrics, settings]);

    const value = useMemo(() => ({
        kerningMap: state.kerningMap,
        suggestedKerningMap: state.suggestedKerningMap,
        ignoredPairs: state.ignoredPairs,
        dispatch,
        queueAutoKern,
        discoverKerning
    }), [state.kerningMap, state.suggestedKerningMap, state.ignoredPairs, queueAutoKern, discoverKerning]);

    return (
        <KerningContext.Provider value={value}>
            {children}
        </KerningContext.Provider>
    );
};

export const useKerning = (): KerningContextType => {
    const context = useContext(KerningContext);
    if (context === undefined) {
        throw new Error('useKerning must be used within a KerningProvider');
    }
    return context;
};
