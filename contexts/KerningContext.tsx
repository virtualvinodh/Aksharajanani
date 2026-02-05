import React, { createContext, useReducer, useContext, ReactNode, useMemo, Dispatch, useEffect, useRef, useCallback } from 'react';
import { KerningMap, GlyphData, FontMetrics, AppSettings, Character } from '../types';
import { initAutoKernWorker, terminateAutoKernWorker } from '../services/autoKerningService';
import { useGlyphData } from './GlyphDataContext';
import { useSettings } from './SettingsContext';

type KerningState = {
    kerningMap: KerningMap;
    suggestedKerningMap: KerningMap;
};

type KerningAction =
    | { type: 'SET_MAP'; payload: KerningMap }
    | { type: 'BATCH_UPDATE'; payload: Map<string, number> }
    | { type: 'SET_SUGGESTIONS'; payload: Map<string, number> }
    | { type: 'MERGE_SUGGESTIONS'; payload: Map<string, number> }
    | { type: 'REMOVE_SUGGESTIONS'; payload: string[] }
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
        case 'RESET':
            return { ...state, kerningMap: new Map(), suggestedKerningMap: new Map() };
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
    dispatch: Dispatch<KerningAction>;
    queueAutoKern: (pairs: QueuedPair[]) => void;
}

const KerningContext = createContext<KerningContextType | undefined>(undefined);

const initialState: KerningState = {
    kerningMap: new Map(),
    suggestedKerningMap: new Map(),
};

export const KerningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(kerningReducer, initialState);
    const { glyphDataMap } = useGlyphData();
    const { settings, metrics } = useSettings();

    const workerRef = useRef<Worker | null>(null);
    const pendingPairsRef = useRef<QueuedPair[]>([]);
    const debounceTimerRef = useRef<number | null>(null);
    const batchIdRef = useRef(0);

    // Initialize worker
    useEffect(() => {
        workerRef.current = initAutoKernWorker();
        
        workerRef.current.onmessage = (e) => {
            const { results } = e.data;
            if (results && Object.keys(results).length > 0) {
                const updateMap = new Map<string, number>();
                Object.entries(results).forEach(([key, val]) => updateMap.set(key, val as number));
                dispatch({ type: 'MERGE_SUGGESTIONS', payload: updateMap });
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
        
        // Prepare data payload (Minimize transfer size)
        const relevantGlyphs: Record<string, GlyphData> = {};
        const pairPayloads = batch.map(p => {
             const lId = p.left.unicode!;
             const rId = p.right.unicode!;
             
             // Only send drawn glyphs
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
        
        // Deduplicate
        const existingKeys = new Set(pendingPairsRef.current.map(p => `${p.left.unicode}-${p.right.unicode}`));
        const newPairs = pairs.filter(p => !existingKeys.has(`${p.left.unicode}-${p.right.unicode}`));
        
        if (newPairs.length > 0) {
            pendingPairsRef.current.push(...newPairs);
            
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            // Debounce for 2 seconds to gather burst edits
            debounceTimerRef.current = window.setTimeout(processQueue, 2000);
        }
    }, [processQueue, settings, metrics]);

    const value = useMemo(() => ({
        kerningMap: state.kerningMap,
        suggestedKerningMap: state.suggestedKerningMap,
        dispatch,
        queueAutoKern
    }), [state.kerningMap, state.suggestedKerningMap, queueAutoKern]);

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