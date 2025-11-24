import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FontMetrics, Character, CharacterSet, GlyphData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import GlyphSelect from './scriptcreator/GlyphSelect';
import { AddIcon, SaveIcon, TrashIcon } from '../constants';

interface GlyphPropertiesPanelProps {
  lsb: number | undefined;
  setLsb: (lsb: number | undefined) => void;
  rsb: number | undefined;
  setRsb: (rsb: number | undefined) => void;
  metrics: FontMetrics;
  onClose: () => void;
  // New props for construction editing - made optional
  character?: Character;
  glyphData?: GlyphData | undefined;
  allCharacterSets?: CharacterSet[];
  onSaveConstruction?: (type: 'drawing' | 'composite' | 'link', components: string[], transforms?: (number | 'absolute' | 'touching')[][]) => void;
}

interface TransformData {
    scale: number;
    y: number;
    absolute: boolean;
    touching: boolean;
}

const GlyphPropertiesPanel: React.FC<GlyphPropertiesPanelProps> = ({ 
  lsb, setLsb, rsb, setRsb, metrics, onClose,
  character, glyphData, allCharacterSets, onSaveConstruction
}) => {
  const { t } = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);

  // Local state for construction editing
  const [type, setType] = useState<'drawing' | 'composite' | 'link'>(() => {
      if (character?.link) return 'link';
      if (character?.composite) return 'composite';
      return 'drawing';
  });
  
  const [components, setComponents] = useState<string[]>(() => {
      return character?.link || character?.composite || [];
  });

  const parseInitialTransforms = (comps: string[]): TransformData[] => {
      const raw = character?.compositeTransform;
      const res: TransformData[] = [];
      
      for (let i = 0; i < comps.length; i++) {
          let tData: TransformData = { scale: 1, y: 0, absolute: false, touching: false };
          if (raw) {
              if (Array.isArray(raw[0])) {
                  // Array of arrays format: [[1, 0], [0.5, -200, 'absolute']]
                  const entry = (raw as any[])[i];
                  if (entry) {
                      tData.scale = typeof entry[0] === 'number' ? entry[0] : 1;
                      tData.y = typeof entry[1] === 'number' ? entry[1] : 0;
                      tData.absolute = entry.includes('absolute');
                      tData.touching = entry.includes('touching');
                  }
              } else {
                   // Simple format: [scale, y] - applies generally, but we map to individual for editing
                   const entry = raw as [number, number];
                   tData.scale = entry[0] ?? 1;
                   tData.y = entry[1] ?? 0;
              }
          }
          res.push(tData);
      }
      return res;
  };

  const [transforms, setTransforms] = useState<TransformData[]>(() => parseInitialTransforms(components));

  const [isAddingComp, setIsAddingComp] = useState(false);
  const [isConstructionExpanded, setIsConstructionExpanded] = useState(false);
  const [isTransformsExpanded, setIsTransformsExpanded] = useState(false);

  // Sync transforms length when components change
  useEffect(() => {
      setTransforms(prev => {
          if (prev.length === components.length) return prev;
          if (prev.length > components.length) return prev.slice(0, components.length);
          // Added new components
          const newItems = new Array(components.length - prev.length).fill({ scale: 1, y: 0, absolute: false, touching: false });
          return [...prev, ...newItems];
      });
  }, [components.length]);

  // Determine if changes have been made
  const originalType = character?.link ? 'link' : (character?.composite ? 'composite' : 'drawing');
  const originalComponents = character?.link || character?.composite || [];
  
  // Simplify dirty check for transforms (deep compare logic)
  const getSerializedTransforms = (ts: TransformData[]) => JSON.stringify(ts.map(t => [t.scale, t.y, t.absolute ? 'absolute' : '', t.touching ? 'touching' : ''].filter(Boolean)));
  const originalTransformsState = parseInitialTransforms(originalComponents);
  
  const isDirty = type !== originalType || 
                  JSON.stringify(components) !== JSON.stringify(originalComponents) ||
                  getSerializedTransforms(transforms) !== getSerializedTransforms(originalTransformsState);

  const isAdvanced = type !== 'drawing';

  // Build lookup map for cycle detection
  const allCharsMap = useMemo(() => {
    if (!allCharacterSets) return new Map<string, Character>();
    const map = new Map<string, Character>();
    allCharacterSets.flatMap(s => s.characters).forEach(c => map.set(c.name, c));
    return map;
  }, [allCharacterSets]);

  // Detect Circular Dependencies
  const cycleDetected = useMemo(() => {
    if (!character || !components.length || !isAdvanced) return false;
    
    // DFS to find if any component eventually points back to the target character
    const checkCycle = (target: string, currentComponents: string[], visited: Set<string>): boolean => {
        for (const compName of currentComponents) {
            if (compName === target) return true; // Cycle detected: Component is the target itself
            if (visited.has(compName)) continue; // Already checked this branch
            
            const compChar = allCharsMap.get(compName);
            if (compChar) {
                const subComponents = compChar.link || compChar.composite || [];
                if (subComponents.length > 0) {
                    // Clone visited for the new branch to allow diamond dependencies, 
                    // but prevent infinite loops in graph traversal
                    const newVisited = new Set(visited);
                    newVisited.add(compName);
                    if (checkCycle(target, subComponents, newVisited)) return true;
                }
            }
        }
        return false;
    };

    return checkCycle(character.name, components, new Set());
  }, [character, components, allCharsMap, isAdvanced]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const propertiesButton = document.getElementById('glyph-properties-button');
        // Also check for pos-properties-button which is used in PositioningEditorPage
        const posPropertiesButton = document.getElementById('pos-properties-button');
        
        if (propertiesButton && propertiesButton.contains(event.target as Node)) {
            return;
        }
        if (posPropertiesButton && posPropertiesButton.contains(event.target as Node)) {
            return;
        }
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleApply = () => {
    if (isDirty && !cycleDetected && onSaveConstruction) {
      // Convert internal TransformData back to (number|'absolute'|'touching')[][]
      const exportTransforms = transforms.map(t => {
          const entry: (number | 'absolute' | 'touching')[] = [t.scale, t.y];
          if (t.absolute) entry.push('absolute');
          if (t.touching) entry.push('touching');
          return entry;
      });
      
      onSaveConstruction(type, components, exportTransforms);
    }
  };

  const handleAddComponent = (name: string) => {
    if (name && !components.includes(name)) {
      setComponents([...components, name]);
    }
    setIsAddingComp(false);
  };

  const updateTransform = (index: number, field: keyof TransformData, value: any) => {
      setTransforms(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const setPositionMode = (index: number, mode: 'relative' | 'absolute' | 'touching') => {
      setTransforms(prev => prev.map((t, i) => {
          if (i !== index) return t;
          return {
              ...t,
              absolute: mode === 'absolute',
              touching: mode === 'touching'
          };
      }));
  };

  const showConstruction = !!character && !!onSaveConstruction && !!allCharacterSets;

  return (
    <div ref={panelRef} className="absolute top-full right-0 mt-2 w-80 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 max-h-[80vh] overflow-y-auto flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-gray-900 dark:text-white">{t('glyphProperties')}</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      {/* Metrics Section */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="lsb-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('leftSpace')} (LSB)
          </label>
          <input
            id="lsb-input"
            type="number"
            placeholder={String(metrics.defaultLSB)}
            value={lsb === undefined ? '' : lsb}
            onChange={(e) => setLsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="rsb-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('rightSpace')} (RSB)
          </label>
          <input
            id="rsb-input"
            type="number"
            placeholder={String(metrics.defaultRSB)}
            value={rsb === undefined ? '' : rsb}
            onChange={(e) => setRsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 text-sm"
          />
        </div>
      </div>

      {showConstruction && (
      <>
      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Construction Section Header */}
      <div>
        <button 
            onClick={() => setIsConstructionExpanded(!isConstructionExpanded)}
            className="flex items-center justify-between w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
            <span>Construction</span>
            <span>{isConstructionExpanded ? '▼' : '▶'}</span>
        </button>
        
        {/* Collapsible Content */}
        {isConstructionExpanded && (
        <div className="animate-fade-in-up">
            {/* Type Selector */}
            <div className="flex bg-gray-200 dark:bg-gray-700 rounded-md p-1 mb-3">
                <button 
                    onClick={() => setType('drawing')}
                    className={`flex-1 text-xs font-medium py-1 rounded transition-colors ${type === 'drawing' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Draw
                </button>
                 <button 
                    onClick={() => setType('composite')}
                    className={`flex-1 text-xs font-medium py-1 rounded transition-colors ${type === 'composite' ? 'bg-white dark:bg-gray-600 text-green-600 dark:text-green-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Comp.
                </button>
                 <button 
                    onClick={() => setType('link')}
                    className={`flex-1 text-xs font-medium py-1 rounded transition-colors ${type === 'link' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Link
                </button>
            </div>

            {/* Components List */}
            {isAdvanced ? (
                <div className="space-y-2">
                     <div className="flex flex-wrap gap-2 min-h-[32px]">
                        {components.map((comp, idx) => (
                            <span 
                                key={idx} 
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${
                                    type === 'link' 
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' 
                                    : 'bg-green-50 text-green-700 border-green-200 border-dashed dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                                }`}
                            >
                                {comp}
                                <button onClick={() => {
                                    setComponents(c => c.filter((_, i) => i !== idx));
                                    setTransforms(t => t.filter((_, i) => i !== idx));
                                }} className="ml-1 text-current hover:text-red-500">
                                    &times;
                                </button>
                            </span>
                        ))}
                        {!isAddingComp && (
                            <button 
                                onClick={() => setIsAddingComp(true)} 
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600"
                            >
                                + Add
                            </button>
                        )}
                     </div>
                     
                     {isAddingComp && allCharacterSets && (
                        <div className="flex items-center gap-1">
                            <GlyphSelect 
                                characterSets={allCharacterSets} 
                                value="" 
                                onChange={handleAddComponent} 
                                label="Select Glyph..."
                                className="text-xs p-1 bg-white dark:bg-gray-700"
                            />
                            <button onClick={() => setIsAddingComp(false)} className="p-1 text-red-500">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                     )}

                     {/* Transform Controls */}
                     {components.length > 0 && (
                         <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <button 
                                onClick={() => setIsTransformsExpanded(!isTransformsExpanded)}
                                className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
                            >
                                <span>{isTransformsExpanded ? '▼' : '▶'}</span>
                                <span>Advanced Transforms</span>
                            </button>
                            
                            {isTransformsExpanded && (
                                <div className="mt-2 space-y-2">
                                    {components.map((comp, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/50 p-2 rounded text-xs">
                                            <span className="font-bold w-6 truncate shrink-0" title={comp}>{comp}</span>
                                            <div className="flex flex-col gap-1.5 flex-grow min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-gray-500">S:</span>
                                                    <input type="number" step="0.1" value={transforms[idx]?.scale} onChange={e => updateTransform(idx, 'scale', parseFloat(e.target.value))} className="w-10 p-0.5 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                                    <span className="text-gray-500 ml-1">Y:</span>
                                                    <input type="number" value={transforms[idx]?.y} onChange={e => updateTransform(idx, 'y', parseInt(e.target.value))} className="w-10 p-0.5 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                                </div>
                                                
                                                {/* Position Mode Segmented Control */}
                                                <div className="flex gap-1 bg-gray-200 dark:bg-gray-600 rounded p-0.5 self-start">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPositionMode(idx, 'relative')}
                                                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${!transforms[idx]?.absolute && !transforms[idx]?.touching ? 'bg-white dark:bg-gray-500 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                        title="Relative Position"
                                                    >Rel</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPositionMode(idx, 'absolute')}
                                                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${transforms[idx]?.absolute ? 'bg-white dark:bg-gray-500 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                        title="Absolute Position"
                                                    >Abs</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPositionMode(idx, 'touching')}
                                                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${transforms[idx]?.touching ? 'bg-white dark:bg-gray-500 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                        title="Touching Previous"
                                                    >Tch</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>
                     )}
                </div>
            ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Manual drawing mode. No components linked.
                </p>
            )}

            {cycleDetected && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">
                    Circular dependency detected! A glyph cannot link to itself directly or indirectly.
                </div>
            )}

            {/* Apply Button */}
            <button 
                onClick={handleApply} 
                disabled={!isDirty || cycleDetected}
                className={`w-full mt-4 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                    isDirty && !cycleDetected
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' 
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                }`}
            >
                {type === 'link' ? 'Relink & Update' : 'Apply Changes'}
            </button>
        </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};

export default GlyphPropertiesPanel;