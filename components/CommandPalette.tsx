
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { Character, GlyphData, PositioningRules, ScriptConfig, KerningMap, RecommendedKerning } from '../types';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { SearchIcon, EditIcon, SettingsIcon, CompareIcon, TestIcon, ExportIcon, SaveIcon, LoadIcon, CodeBracketsIcon, CopyIcon, AddIcon } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectGlyph: (character: Character) => void;
    onSetWorkspace: (workspace: any) => void;
    onAction: (action: string, data?: any) => void;
    positioningRules: PositioningRules[] | null;
    script: ScriptConfig;
    hasKerning: boolean;
    kerningMap?: KerningMap;
    allCharsByUnicode?: Map<number, Character>;
    recommendedKerning?: RecommendedKerning[] | null;
}

interface SearchResult {
    id: string;
    type: 'glyph' | 'workspace' | 'action' | 'positioning' | 'kerning-pair' | 'create';
    title: string;
    subtitle?: string;
    aliases?: string[]; // New property for search synonyms
    icon?: React.ReactNode;
    onExecute: () => void;
    unicode?: number;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ 
    isOpen, onClose, onSelectGlyph, onSetWorkspace, onAction, 
    positioningRules, script, hasKerning, kerningMap, allCharsByUnicode, recommendedKerning 
}) => {
    const { t } = useLocale();
    // MIGRATION: Use useProject instead of useCharacter
    const { characterSets, allCharsByName } = useProject();
    const { glyphDataMap } = useGlyphData();
    const { settings } = useSettings();
    const { state: rulesState } = useRules();
    const { setPendingNavigationTarget } = useLayout();

    const inputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);
    
    // Optimization: Cache the full list of items in state so it doesn't re-compute on every parent render
    const [cachedItems, setCachedItems] = useState<SearchResult[]>([]);
    
    // Helper to resolve groups referenced in rules (e.g. $vowels) to individual character names
    const expandGroup = useMemo(() => {
        const resolve = (name: string, visited: Set<string>, depth: number): string[] => {
            if (typeof name !== 'string') return []; // Safety check for malformed data
            if (depth > 50) return []; // Recursion depth limit to prevent stack overflow

            const trimmedName = name.trim();
            if (!trimmedName.startsWith('$')) return [trimmedName];
            
            const groupName = trimmedName.substring(1);
            if (visited.has(groupName)) return []; // Cycle detected, stop recursion
            
            const newVisited = new Set(visited).add(groupName);

            // 1. Check character sets (e.g. $vowels from characters.json)
            const charSet = characterSets?.find(s => s.nameKey === groupName);
            if (charSet) {
                return charSet.characters.map(c => c.name);
            }
            // 2. Check groups defined in rules.json (e.g. $consAll)
            // Access groups from the rules state if available
            const rulesGroups = rulesState.fontRules?.groups;
            if (rulesGroups && rulesGroups[groupName]) {
                // Recursively expand groups if a group contains other groups
                const members = rulesGroups[groupName] as string[];
                if (Array.isArray(members)) {
                    return members.flatMap(m => resolve(m, newVisited, depth + 1));
                }
            }
            
            return [];
        };
        // Return a function that deduplicates results using a Set
        return (name: string) => Array.from(new Set(resolve(name, new Set(), 0)));
    }, [characterSets, rulesState.fontRules]);

    // Build the static search index only when the palette opens.
    // This prevents the expensive glyphDataMap scan from running during drawing.
    useEffect(() => {
        if (isOpen) {
            const items: SearchResult[] = [];

            const isSimple = settings?.editorMode === 'simple' && !settings?.preferKerningTerm;

            // 1. Workspaces
            items.push({ 
                id: 'ws-drawing', 
                type: 'workspace', 
                title: t('workspaceDrawing'), 
                aliases: ['Editor', 'Design', 'Create'],
                icon: <EditIcon />, 
                onExecute: () => onSetWorkspace('drawing') 
            });
            
            if (positioningRules && positioningRules.length > 0) {
                items.push({ 
                    id: 'ws-positioning', 
                    type: 'workspace', 
                    title: t('workspacePositioning'),
                    aliases: ['Marks', 'Attachment', 'Anchor', 'Positions'],
                    icon: <SettingsIcon />, 
                    onExecute: () => onSetWorkspace('positioning') 
                });
            }
            
            const kerningLabel = isSimple ? t('workspaceSpacing') : t('workspaceKerning');
            const showKerning = hasKerning;
            
            if (showKerning) {
                items.push({ 
                    id: 'ws-kerning', 
                    type: 'workspace', 
                    title: kerningLabel, 
                    aliases: ['Kerning', 'Spacing', 'Pairs', 'Kern'], // Explicitly alias both terms
                    icon: <SettingsIcon />, 
                    onExecute: () => onSetWorkspace('kerning') 
                });
            }
            
            // Rules workspace is now always available
            items.push({ id: 'ws-rules', type: 'workspace', title: t('workspaceRules'), aliases: ['Features', 'OpenType', 'Substitution', 'Liga'], icon: <SettingsIcon />, onExecute: () => onSetWorkspace('rules') });

            // 2. Actions
            items.push({ id: 'act-save', type: 'action', title: t('save'), icon: <SaveIcon />, onExecute: () => onAction('save') });
            items.push({ id: 'act-save-as', type: 'action', title: 'Save Copy...', aliases: ['Duplicate Project', 'Branch'], icon: <CopyIcon />, onExecute: () => onAction('save-as') });
            items.push({ id: 'act-export-json', type: 'action', title: t('exportJson'), icon: <CodeBracketsIcon />, onExecute: () => onAction('export-json') });
            items.push({ id: 'act-load-json', type: 'action', title: t('load'), icon: <LoadIcon />, onExecute: () => onAction('load-json') });
            items.push({ id: 'act-export', type: 'action', title: t('exportOtf'), icon: <ExportIcon />, onExecute: () => onAction('export') });
            items.push({ id: 'act-test', type: 'action', title: t('testFont'), icon: <TestIcon />, onExecute: () => onAction('test') });
            items.push({ id: 'act-compare', type: 'action', title: t('compare'), icon: <CompareIcon />, onExecute: () => onAction('compare') });
            // Redirect "Metrics" searches to Settings
            items.push({ id: 'act-settings', type: 'action', title: t('settings'), aliases: ['Metrics', 'Global Metrics', 'Ascender', 'Descender', 'UPM'], icon: <SettingsIcon />, onExecute: () => onAction('settings') });

            // 3. Glyphs (Snapshot of drawn state at open time)
            if (characterSets) {
                characterSets.forEach(set => {
                    set.characters.forEach(char => {
                        if (!char.hidden) {
                            // We access glyphDataMap here, but only once when opening
                            items.push({
                                id: `glyph-${char.unicode}`,
                                type: 'glyph',
                                title: char.name,
                                subtitle: char.unicode ? `U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')} • ${t(set.nameKey)}` : t(set.nameKey),
                                icon: <span className="font-bold text-lg">{char.name}</span>,
                                onExecute: () => onSelectGlyph(char),
                                unicode: char.unicode
                            });
                        }
                    });
                });
            }
            setCachedItems(items);
            
            setSearchTerm('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    // We intentionally exclude glyphDataMap from deps to avoid re-running on every stroke.
    // It updates only when isOpen becomes true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, t, characterSets, settings, onSetWorkspace, onAction, onSelectGlyph, positioningRules, script, hasKerning]);

    
    const dynamicResults = useMemo(() => {
        if (!searchTerm) return [];
        const query = searchTerm.toLowerCase();
        const results: SearchResult[] = [];
        const MAX_RESULTS = 20;
        
        // --- Positioning Results ---
        if (positioningRules) {
            let posCount = 0;
            for (const rule of positioningRules) {
                 const bases = rule.base.flatMap(b => expandGroup(b));
                 const marks = (rule.mark || []).flatMap(m => expandGroup(m));
                 
                 for (const baseName of bases) {
                     for (const markName of marks) {
                         if (posCount >= 5) break; // Limit positioning results to keep UI clean
                         
                         const pairName = baseName + markName;
                         if (pairName.toLowerCase().includes(query) || 
                             (baseName.toLowerCase().includes(query) && markName.toLowerCase().includes(query))) {
                             
                             const baseChar = allCharsByName.get(baseName);
                             const markChar = allCharsByName.get(markName);

                             if (baseChar && markChar) {
                                 // CHECK: Ensure both components are drawn before offering to position them
                                 if (isGlyphDrawn(glyphDataMap.get(baseChar.unicode)) && isGlyphDrawn(glyphDataMap.get(markChar.unicode))) {
                                     const pairId = `${baseChar.unicode}-${markChar.unicode}`;
                                     results.push({
                                         id: `pos-${pairId}`,
                                         type: 'positioning',
                                         title: `${baseName} + ${markName}`,
                                         subtitle: t('positioning'),
                                         icon: <span className="flex gap-0.5"><span className="opacity-50">{baseName}</span><span>{markName}</span></span>,
                                         onExecute: () => {
                                             onSetWorkspace('positioning');
                                             setPendingNavigationTarget(pairId);
                                         }
                                     });
                                     posCount++;
                                 }
                             }
                         }
                     }
                 }
            }
        }

        // --- Kerning Results (Custom & Recommended) ---
        // Only generate if searching for a pair or parts of it
        // The condition for hasKerning is now simplified
        if (hasKerning && allCharsByUnicode && (kerningMap || recommendedKerning)) {
             const existingPairs = new Set<string>();

             // 1. Index existing (saved) kerning pairs
             if (kerningMap) {
                 kerningMap.forEach((value, key) => {
                    if (results.length >= MAX_RESULTS) return;
                    existingPairs.add(key);
                    
                    const [lId, rId] = key.split('-').map(Number);
                    const left = allCharsByUnicode.get(lId);
                    const right = allCharsByUnicode.get(rId);
                    
                    if (left && right) {
                        // CHECK: Ensure both glyphs exist and are drawn
                         if (isGlyphDrawn(glyphDataMap.get(left.unicode)) && isGlyphDrawn(glyphDataMap.get(right.unicode))) {
                            const pairName = left.name + right.name;
                            if (pairName.toLowerCase().includes(query) || 
                                (left.name.toLowerCase().includes(query) && right.name.toLowerCase().includes(query))) {
                                
                                results.push({
                                    id: `kern-${key}`,
                                    type: 'kerning-pair',
                                    title: `${left.name} + ${right.name}`,
                                    subtitle: `${t('kerning')}: ${value}`,
                                    icon: <span className="flex gap-1"><span>{left.name}</span><span>{right.name}</span></span>,
                                    onExecute: () => {
                                        onSetWorkspace('kerning');
                                        setPendingNavigationTarget(key); // e.g. "65-86"
                                    }
                                });
                            }
                        }
                    }
                 });
             }

             // 2. Index recommended pairs (if not already saved)
             if (recommendedKerning) {
                 for (const [lName, rName] of recommendedKerning) {
                    if (results.length >= MAX_RESULTS) break;

                    // Expand groups if recommended pair uses groups (e.g. $cons, $vowels)
                    const lefts = expandGroup(lName);
                    const rights = expandGroup(rName);
                    
                    // Optimization: Only check pairs that plausibly match the search term
                    for (const l of lefts) {
                        for (const r of rights) {
                             const leftChar = allCharsByName.get(l);
                             const rightChar = allCharsByName.get(r);
                             
                             if (leftChar && rightChar) {
                                 const pairId = `${leftChar.unicode}-${rightChar.unicode}`;
                                 if (existingPairs.has(pairId)) continue; // Already handled in custom list
                                 
                                 const pairName = l + r;
                                 if (pairName.toLowerCase().includes(query) || 
                                    (l.toLowerCase().includes(query) && r.toLowerCase().includes(query))) {
                                     
                                     // CHECK: Ensure both components are drawn
                                     if (isGlyphDrawn(glyphDataMap.get(leftChar.unicode)) && isGlyphDrawn(glyphDataMap.get(rightChar.unicode))) {
                                         results.push({
                                             id: `kern-rec-${pairId}`,
                                             type: 'kerning-pair',
                                             title: `${l} + ${r}`,
                                             subtitle: t('recommendedKerning'),
                                             icon: <span className="flex gap-1"><span>{l}</span><span>{r}</span></span>,
                                             onExecute: () => {
                                                 onSetWorkspace('kerning');
                                                 setPendingNavigationTarget(pairId);
                                             }
                                         });
                                         if (results.length >= MAX_RESULTS) break;
                                     }
                                 }
                             }
                        }
                        if (results.length >= MAX_RESULTS) break;
                    }
                 }
             }
        }

        return results;

    }, [searchTerm, positioningRules, allCharsByName, t, onSetWorkspace, setPendingNavigationTarget, expandGroup, hasKerning, kerningMap, allCharsByUnicode, recommendedKerning, glyphDataMap]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) {
            // Default view: Just Workspaces and Actions
            return cachedItems.filter(i => i.type === 'workspace' || i.type === 'action');
        }
        
        const lowerTerm = searchTerm.toLowerCase();
        const allCandidates = [...cachedItems, ...dynamicResults];

        // Scoring Algorithm
        const scoredItems = allCandidates.map(item => {
            let score = 0;
            const titleLower = item.title.toLowerCase();
            const subLower = item.subtitle?.toLowerCase() || '';
            const aliases = item.aliases?.map(a => a.toLowerCase()) || [];

            // 1. Title Matches (Highest Priority)
            if (titleLower === lowerTerm) score = 100; // Exact match
            else if (titleLower.startsWith(lowerTerm)) score = 80; // Starts with
            else if (titleLower.includes(lowerTerm)) score = 60; // Contains
            
            // 2. Alias Matches (High Priority - handles "Kerning" -> "Spacing")
            if (score === 0 && aliases.length > 0) {
                for (const alias of aliases) {
                    if (alias === lowerTerm) { score = 90; break; } // Exact alias match
                    else if (alias.startsWith(lowerTerm)) { score = 70; break; } // Alias starts with
                    else if (alias.includes(lowerTerm)) { score = 50; break; } // Alias contains
                }
            }

            // 3. Subtitle Matches (Lowest Priority)
            if (score === 0 && subLower.includes(lowerTerm)) {
                score = 10;
            }

            return { item, score };
        });

        // Filter out non-matches
        const matches = scoredItems.filter(i => i.score > 0);

        // Sort by Score Descending, then by Type Priority
        const typePriority = {
            create: 6,
            glyph: 5,
            'kerning-pair': 4,
            positioning: 3,
            workspace: 2,
            action: 1
        };

        matches.sort((a, b) => {
            if (a.score !== b.score) {
                return b.score - a.score; // Higher score first
            }
            // Tie-breaker: Type priority
            return typePriority[b.item.type] - typePriority[a.item.type];
        });
        
        const results = matches.map(m => m.item);
        
        // Progressive Disclosure: "Create Glyph" Option
        // If the search yields no exact glyph matches, offer to create it.
        // We check if any of the results are of type 'glyph' that exactly match the search term
        const hasExactGlyphMatch = results.some(i => i.type === 'glyph' && i.title.toLowerCase() === lowerTerm);
        
        if (!hasExactGlyphMatch && searchTerm.trim()) {
            results.push({
                id: 'create-glyph-option',
                type: 'create',
                title: `Create glyph for "${searchTerm}"`,
                subtitle: 'Add to Custom Glyphs',
                icon: <AddIcon className="w-5 h-5 text-green-500" />,
                onExecute: () => onAction('quick-add-glyph', { prefillName: searchTerm, targetSet: 'Custom Glyphs' })
            });
        }

        return results;

    }, [cachedItems, searchTerm, dynamicResults]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % filteredItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredItems[activeIndex]) {
                filteredItems[activeIndex].onExecute();
                onClose();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    useEffect(() => {
        if (listRef.current) {
            const activeElement = listRef.current.children[activeIndex] as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4">
             <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
             
             <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[80vh] animate-modal-enter">
                 <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 gap-3">
                    <SearchIcon className="w-5 h-5 text-gray-400" />
                    <input 
                        ref={inputRef}
                        type="text" 
                        className="flex-grow bg-transparent text-lg placeholder-gray-400 dark:text-white focus:outline-none"
                        placeholder={t('searchChar') + " or command..."}
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setActiveIndex(0); }}
                        onKeyDown={handleKeyDown}
                    />
                    <button onClick={onClose} className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-500 dark:text-gray-400">ESC</button>
                 </div>
                 
                 <div className="overflow-y-auto p-2">
                     {filteredItems.length > 0 ? (
                         <ul ref={listRef}>
                             {filteredItems.map((item, index) => (
                                 <li key={item.id}>
                                     <button
                                        onClick={() => { item.onExecute(); onClose(); }}
                                        className={`w-full flex items-center gap-4 p-3 rounded-lg text-left transition-colors ${index === activeIndex ? 'bg-indigo-600 text-white' : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        onMouseEnter={() => setActiveIndex(index)}
                                     >
                                         <div className={`flex items-center justify-center w-8 h-8 rounded-md ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                             {item.icon}
                                         </div>
                                         <div>
                                             <div className="font-semibold">{item.title}</div>
                                             {item.subtitle && <div className={`text-xs ${index === activeIndex ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>{item.subtitle}</div>}
                                         </div>
                                         {item.type === 'workspace' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Go</span>}
                                         {item.type === 'action' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Run</span>}
                                         {item.type === 'positioning' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Edit</span>}
                                         {item.type === 'kerning-pair' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Kern</span>}
                                         {item.type === 'glyph' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Edit</span>}
                                         {item.type === 'create' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>New</span>}
                                     </button>
                                 </li>
                             ))}
                         </ul>
                     ) : (
                         <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                             {t('noResultsFound')}
                         </div>
                     )}
                 </div>
                 <div className="bg-gray-50 dark:bg-gray-900/50 p-2 text-xs text-gray-500 border-t dark:border-gray-700 flex justify-between px-4">
                    <span>Use arrow keys to navigate</span>
                    <span>{filteredItems.length} results</span>
                </div>
             </div>
        </div>
    );
};

export default React.memo(CommandPalette);
