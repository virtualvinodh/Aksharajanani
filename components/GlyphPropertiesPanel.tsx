
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FontMetrics, Character, CharacterSet, GlyphData, ComponentTransform, PositioningMode, Path } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import SmartGlyphInput from './rules/manager/SmartGlyphInput';
import { SaveIcon, TrashIcon, RightArrowIcon, CloseIcon, AddIcon } from '../constants';
import { useRules } from '../contexts/RulesContext';
import { GlyphDataAction } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { useProject } from '../contexts/ProjectContext';

// Helper component for managing a list of components
const ComponentListEditor: React.FC<{
    components: string[];
    setComponents: (c: string[]) => void;
    transforms?: ComponentTransform[];
    setTransforms?: (t: ComponentTransform[]) => void;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    label?: string;
    showAdvanced?: boolean;
    color?: 'blue' | 'purple';
}> = ({ components, setComponents, transforms, setTransforms, characterSets, groups, label, showAdvanced = true, color = 'blue' }) => {
    const { t } = useLocale();
    const [inputValue, setInputValue] = useState('');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [showInput, setShowInput] = useState(false);

    const handleAdd = (val: string) => {
        if (val && !components.includes(val)) {
            setComponents([...components, val]);
            if (setTransforms && transforms) {
                setTransforms([...transforms, { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' }]);
            }
            setInputValue('');
            setShowInput(false);
        }
    };

    const handleRemove = (index: number) => {
        setComponents(components.filter((_, i) => i !== index));
        if (setTransforms && transforms) {
            setTransforms(transforms.filter((_, i) => i !== index));
        }
    };

    const handleTransformChange = (index: number, field: keyof ComponentTransform, value: any) => {
        if (!setTransforms || !transforms) return;
        const newTransforms = [...transforms];
        if (!newTransforms[index]) newTransforms[index] = { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' };
        const current = { ...newTransforms[index] };
        (current as any)[field] = value;
        newTransforms[index] = current;
        setTransforms(newTransforms);
    };

    const colorClasses = color === 'purple' 
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800';

    return (
        <div className="space-y-3">
            {label && <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>}
            <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 items-center">
                {components.map((comp, idx) => (
                    <span key={idx} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border ${colorClasses}`}>
                        {comp}
                        <button onClick={() => handleRemove(idx)} className="hover:text-red-500 focus:outline-none">
                            <CloseIcon className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                
                {showInput ? (
                    <div className="flex-grow min-w-[100px]">
                         <SmartGlyphInput 
                            value={inputValue}
                            onChange={setInputValue}
                            characterSets={characterSets}
                            groups={{}} 
                            showSets={false} 
                            placeholder="Type char..."
                            className="w-full border-none focus:ring-0 p-0 text-xs bg-transparent"
                            autoFocus={true}
                            onSelect={handleAdd}
                            onBlur={() => { if (!inputValue) setShowInput(false); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAdd(inputValue);
                                }
                                if (e.key === 'Escape') {
                                    setShowInput(false);
                                    setInputValue('');
                                }
                            }}
                         />
                    </div>
                ) : (
                    <button 
                        onClick={() => setShowInput(true)} 
                        className="p-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded transition-colors"
                        title="Add Component"
                    >
                        <AddIcon className="w-4 h-4" />
                    </button>
                )}
            </div>

            {showAdvanced && setTransforms && transforms && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                    <button 
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} 
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                    >
                        <RightArrowIcon className={`w-3 h-3 transition-transform ${isAdvancedOpen ? 'rotate-90' : ''}`} />
                        ADVANCED TRANSFORMS
                    </button>
                    
                    {isAdvancedOpen && (
                        <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                             {components.map((comp, index) => {
                                const tr = transforms[index] || { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' };
                                return (
                                    <div key={index} className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded text-xs space-y-2">
                                        <div className="font-bold text-gray-700 dark:text-gray-300 truncate">{comp}</div>
                                        <div className="flex gap-2 items-center">
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-gray-500 uppercase">Scale</label>
                                                <input type="text" value={tr.scale} onChange={e => handleTransformChange(index, 'scale', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-gray-500 uppercase">Rot (°)</label>
                                                <input type="text" value={tr.rotation || 0} onChange={e => handleTransformChange(index, 'rotation', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-gray-500 uppercase">X</label>
                                                <input type="text" value={tr.x} onChange={e => handleTransformChange(index, 'x', parseInt(e.target.value, 10) || 0)} className="w-full p-1 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[9px] text-gray-500 uppercase">Y</label>
                                                <input type="text" value={tr.y} onChange={e => handleTransformChange(index, 'y', parseInt(e.target.value, 10) || 0)} className="w-full p-1 border rounded bg-white dark:bg-gray-600 dark:border-gray-500" />
                                            </div>
                                        </div>
                                        {index > 0 && (
                                            <div>
                                                <label className="block text-[9px] text-gray-500 uppercase mb-1">Mode</label>
                                                <div className="flex bg-gray-200 dark:bg-gray-600 rounded p-0.5">
                                                    {(['relative', 'absolute', 'touching'] as const).map(m => (
                                                        <button
                                                            key={m}
                                                            onClick={() => handleTransformChange(index, 'mode', m)}
                                                            className={`flex-1 py-0.5 rounded text-[10px] capitalize ${tr.mode === m ? 'bg-white dark:bg-gray-500 shadow text-indigo-600 dark:text-indigo-300 font-bold' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                        >
                                                            {m.slice(0, 3)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                             })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface GlyphPropertiesPanelProps {
  lsb: number | undefined;
  setLsb: (lsb: number | undefined) => void;
  rsb: number | undefined;
  setRsb: (rsb: number | undefined) => void;
  metrics: FontMetrics;
  onClose: () => void;
  
  character?: Character;
  glyphData?: GlyphData | undefined;
  allCharacterSets?: CharacterSet[];
  onSaveConstruction?: (type: 'drawing' | 'composite' | 'link', components: string[], transforms?: ComponentTransform[]) => void;
  
  glyphClass?: Character['glyphClass'];
  setGlyphClass?: (val: Character['glyphClass']) => void;
  advWidth?: number | string;
  setAdvWidth?: (val: number | string | undefined) => void;
  
  // New: Label Property
  label?: string;
  setLabel?: (val: string | undefined) => void;
  
  // New: Liga Property
  liga?: string[];
  setLiga?: (val: string[] | undefined) => void;

  // Positioning/Kerning Props (Restored)
  position?: [string, string];
  setPosition?: (val: [string, string] | undefined) => void;
  kern?: [string, string];
  setKern?: (val: [string, string] | undefined) => void;
  gpos?: string;
  setGpos?: (val: string | undefined) => void;
  gsub?: string;
  setGsub?: (val: string | undefined) => void;
  compositeTransform?: ComponentTransform[];
  setCompositeTransform?: (val: ComponentTransform[] | undefined) => void;

  characterDispatch?: any;
  glyphDataDispatch?: (action: GlyphDataAction) => void;
  onPathsChange?: (paths: Path[]) => void;

  // New: Hide structural editing for Positioning Workspace
  disableStructuralEditing?: boolean;
}

const GlyphPropertiesPanel: React.FC<GlyphPropertiesPanelProps> = ({ 
  lsb, setLsb, rsb, setRsb, metrics, onClose,
  character, glyphData, allCharacterSets, onSaveConstruction,
  glyphClass, setGlyphClass, advWidth, setAdvWidth,
  label, setLabel,
  liga, setLiga,
  position, setPosition, kern, setKern, gpos, setGpos, gsub, setGsub,
  compositeTransform, setCompositeTransform,
  characterDispatch, glyphDataDispatch, onPathsChange,
  disableStructuralEditing = false
}) => {
  const { t } = useLocale();
  const { state: rulesState } = useRules();
  const { kerningMap, dispatch: kerningDispatch } = useKerning();
  const { allCharsByName } = useProject();

  const groups = rulesState.fontRules?.groups || {};
  const panelRef = useRef<HTMLDivElement>(null);

  type ConstructionType = 'drawing' | 'composite' | 'link' | 'positioning' | 'kerning';
  
  const [type, setType] = useState<ConstructionType>(() => {
      if (character?.position) return 'positioning';
      if (character?.kern) return 'kerning';
      if (character?.link) return 'link';
      if (character?.composite) return 'composite';
      return 'drawing';
  });
  
  const [components, setComponents] = useState<string[]>(character?.link || character?.composite || []);
  const [transforms, setTransforms] = useState<ComponentTransform[]>(character?.compositeTransform || []);
  
  const [positionComps, setPositionComps] = useState<[string, string]>(character?.position || ['', '']);
  const [kernComps, setKernComps] = useState<[string, string]>(character?.kern || ['', '']);
  
  // Set default state to false to close accordions by default
  const [isClassificationExpanded, setIsClassificationExpanded] = useState(false);
  const [isConstructionExpanded, setIsConstructionExpanded] = useState(false);

  // --- SYNC INTERNAL STATE WITH PROPS ---
  useEffect(() => {
    if (!character) return;
    
    let newType: ConstructionType = 'drawing';
    if (character.position) newType = 'positioning';
    else if (character.kern) newType = 'kerning';
    else if (character.link) newType = 'link';
    else if (character.composite) newType = 'composite';
    
    setType(newType);

    if (newType === 'link' || newType === 'composite') {
        setComponents(character.link || character.composite || []);
        setTransforms(compositeTransform || character.compositeTransform || []);
    } else if (newType === 'positioning') {
        setPositionComps(character.position || ['', '']);
    } else if (newType === 'kerning') {
        setKernComps(character.kern || ['', '']);
    } else {
        setComponents([]);
        setTransforms([]);
    }
  }, [character]);

  useEffect(() => {
    if (compositeTransform) {
        setTransforms(compositeTransform);
    }
  }, [compositeTransform]);

  useEffect(() => {
      if (transforms.length !== components.length) {
          const newTransforms = [...transforms];
          if (newTransforms.length > components.length) {
              setTransforms(newTransforms.slice(0, components.length));
          } else {
              while (newTransforms.length < components.length) {
                  newTransforms.push({ scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' });
              }
              setTransforms(newTransforms);
          }
      }
  }, [components.length]);

  const constructionTypes: { id: ConstructionType, label: string }[] = [
      { id: 'drawing', label: 'Draw' },
      { id: 'composite', label: 'Comp.' },
      { id: 'link', label: 'Link' },
  ];

  if (setPosition) constructionTypes.push({ id: 'positioning', label: 'Pos.' });
  if (setKern) constructionTypes.push({ id: 'kerning', label: 'Kern' });

  const handleTypeChange = (newType: ConstructionType) => {
    if (newType === type) return;
    
    if (newType === 'drawing') {
        setComponents([]);
        setTransforms([]);
    } else if (newType === 'link' || newType === 'composite') {
        if (type !== 'link' && type !== 'composite') {
             if (components.length === 0 && character?.composite) {
                 setComponents(character.composite);
                 setTransforms(character.compositeTransform || []);
             } else if (components.length === 0 && character?.link) {
                 setComponents(character.link);
            }
        }
    } else if (newType === 'positioning') {
         if (character?.position) setPositionComps(character.position);
         else setPositionComps(['', '']);
    } else if (newType === 'kerning') {
         if (character?.kern) setKernComps(character.kern);
         else setKernComps(['', '']);
    }
    
    setType(newType);
  };
  
  const handleApplyConstruction = () => {
      if (!character || !onSaveConstruction) return;

      if (character.kern) {
          const isRemovingKern = type !== 'kerning';
          const isChangingKern = type === 'kerning' && (kernComps[0] !== character.kern[0] || kernComps[1] !== character.kern[1]);

          if (isRemovingKern || isChangingKern) {
              const [leftName, rightName] = character.kern;
              const leftChar = allCharsByName.get(leftName);
              const rightChar = allCharsByName.get(rightName);
              
              if (leftChar?.unicode !== undefined && rightChar?.unicode !== undefined) {
                  const key = `${leftChar.unicode}-${rightChar.unicode}`;
                  if (kerningMap.has(key)) {
                      const newMap = new Map(kerningMap);
                      newMap.delete(key);
                      kerningDispatch({ type: 'SET_MAP', payload: newMap });
                  }
              }
          }
      }

      if (type === 'positioning' && setPosition && positionComps[0] && positionComps[1]) {
           setPosition(positionComps);
           if (setGpos) setGpos(gpos);
           if (setGsub) setGsub(gsub);
           if (onPathsChange) onPathsChange([]);
           if (glyphDataDispatch) glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: character.unicode! }});
           
           if (characterDispatch) {
               characterDispatch({ type: 'UPDATE_CHARACTER_METADATA', payload: { unicode: character.unicode!, link: undefined, composite: undefined, kern: undefined, position: positionComps }});
           }
           onClose();
           return;
      }
      
      if (type === 'kerning' && setKern && kernComps[0] && kernComps[1]) {
           setKern(kernComps);
           if (onPathsChange) onPathsChange([]);
           if (glyphDataDispatch) glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: character.unicode! }});
           if (characterDispatch) {
               characterDispatch({ type: 'UPDATE_CHARACTER_METADATA', payload: { unicode: character.unicode!, link: undefined, composite: undefined, position: undefined, kern: kernComps }});
           }
           onClose();
           return;
      }

      // Allow saving transforms for both composites and links
      onSaveConstruction(type as 'drawing' | 'composite' | 'link', components, transforms);
      onClose();
  };

  const isNonSpacing = advWidth === 0 || advWidth === '0';
  const showConstruction = !!character && !!onSaveConstruction && !!allCharacterSets;

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[90] sm:hidden" onClick={onClose} aria-hidden="true" />

    <div 
      ref={panelRef} 
      className="
        fixed top-20 left-0 right-0 mx-auto w-[90vw] max-h-[70vh] z-[100] flex flex-col gap-4 p-4
        bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-y-auto
        sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:left-auto sm:mt-2 sm:w-80 sm:h-auto sm:max-h-[80vh] sm:mx-0
      "
    >
      <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2 flex-shrink-0">
        <h4 className="font-bold text-gray-900 dark:text-white">{t('glyphProperties')}</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:white">
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>
      
      {!isNonSpacing && type !== 'kerning' && !gpos && (
      <div className="grid grid-cols-2 gap-3 flex-shrink-0">
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {t('leftSpace')}
              </label>
              <input
                  type="text"
                  placeholder={String(metrics.defaultLSB)}
                  value={lsb ?? ''}
                  onChange={(e) => setLsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
          </div>
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  {t('rightSpace')}
              </label>
              <input
                  type="text"
                  placeholder={String(metrics.defaultRSB)}
                  value={rsb ?? ''}
                  onChange={(e) => setRsb(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
          </div>
      </div>
      )}

      {/* Label and Codepoint */}
      <div className="grid grid-cols-2 gap-3 flex-shrink-0">
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  Label (Ghost)
              </label>
              <input
                  type="text"
                  placeholder={character?.name}
                  value={label || ''}
                  onChange={(e) => setLabel && setLabel(e.target.value === '' ? undefined : e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
          </div>
          <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                  Codepoint
              </label>
              <input
                  type="text"
                  value={character?.unicode !== undefined && character.glyphClass !== 'virtual' ? `U+${character.unicode.toString(16).toUpperCase().padStart(4, '0')}` : 'Virtual'}
                  disabled
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm text-gray-500 cursor-not-allowed font-mono"
              />
          </div>
      </div>
      
      {!disableStructuralEditing && setGlyphClass && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex-shrink-0">
            <button 
                onClick={() => setIsClassificationExpanded(!isClassificationExpanded)}
                className="flex items-center justify-between w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
                <span>Classification</span>
                <RightArrowIcon className={`w-3 h-3 transition-transform ${isClassificationExpanded ? 'rotate-90' : ''}`} />
            </button>
            
            {isClassificationExpanded && (
                <div className="mt-3 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            {(['base', 'ligature', 'mark', 'virtual'] as const).map((typeOption) => {
                                const isActive = (glyphClass || 'base') === typeOption;
                                return (
                                    <button
                                        key={typeOption}
                                        type="button"
                                        onClick={() => setGlyphClass(typeOption)}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${
                                            isActive
                                            ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    >
                                        {typeOption}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Ligature Components Input */}
                    {glyphClass === 'ligature' && setLiga && (
                        <div className="space-y-2 animate-fade-in-up">
                            <ComponentListEditor
                                label="Ligature Components (GSUB)"
                                components={liga || []}
                                setComponents={(c) => setLiga(c.length > 0 ? c : undefined)}
                                characterSets={allCharacterSets!}
                                groups={groups}
                                showAdvanced={false}
                                color="purple"
                            />
                            {setGsub && (
                                <input 
                                    type="text" 
                                    value={gsub || ''} 
                                    onChange={e => setGsub(e.target.value)} 
                                    className="w-full p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-xs font-mono" 
                                    placeholder="Feature Tag (e.g. dlig)"
                                    title="GSUB Feature Tag (Default: liga)"
                                />
                            )}
                        </div>
                    )}

                    {setAdvWidth && glyphClass === 'mark' && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600 animate-fade-in-up">
                             <input 
                                type="checkbox" 
                                id="non-spacing" 
                                checked={isNonSpacing} 
                                onChange={e => setAdvWidth(e.target.checked ? 0 : undefined)}
                                className="h-4 w-4 rounded accent-indigo-600 cursor-pointer"
                             />
                             <label htmlFor="non-spacing" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">Non-spacing (Width: 0)</label>
                        </div>
                    )}
                </div>
            )}
        </div>
      )}

      {!disableStructuralEditing && showConstruction && (
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex-shrink-0">
        <button 
            onClick={() => setIsConstructionExpanded(!isConstructionExpanded)}
            className="flex items-center justify-between w-full text-xs font-bold text-gray-500 dark:text-gray-400 uppercase hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
            <span>Construction</span>
            <RightArrowIcon className={`w-3 h-3 transition-transform ${isConstructionExpanded ? 'rotate-90' : ''}`} />
        </button>
        
        {isConstructionExpanded && (
        <div className="mt-3 animate-fade-in-up">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-4">
                {constructionTypes.map(ct => (
                    <button
                        key={ct.id}
                        onClick={() => handleTypeChange(ct.id)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                            type === ct.id 
                            ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-white shadow-sm' 
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                    >
                        {ct.label}
                    </button>
                ))}
            </div>
            
            {type === 'drawing' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2">
                    Manual drawing mode. Paths are stored directly.
                </p>
            )}

            {(type === 'composite' || type === 'link') && (
                <ComponentListEditor
                    label="Geometric Sources"
                    components={components}
                    setComponents={setComponents}
                    transforms={transforms}
                    setTransforms={setTransforms}
                    characterSets={allCharacterSets!}
                    groups={groups}
                    showAdvanced={true} // Enable advanced UI for composites too
                />
            )}

            {type === 'positioning' && (
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <div className="flex-1">
                             <SmartGlyphInput 
                                value={positionComps[0]} 
                                onChange={v => setPositionComps([v, positionComps[1]])} 
                                characterSets={allCharacterSets!} 
                                groups={{}} 
                                showSets={false} 
                                placeholder="Base" 
                             />
                        </div>
                        <div className="flex-1">
                             <SmartGlyphInput 
                                value={positionComps[1]} 
                                onChange={v => setPositionComps([positionComps[0], v])} 
                                characterSets={allCharacterSets!} 
                                groups={{}} 
                                showSets={false} 
                                placeholder="Mark" 
                             />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            {/* Note: This is an extra input for GPOS if used in Positioning construction mode. GSUB is handled in Metadata section for Ligatures. */}
                            <input type="text" value={gpos || ''} onChange={e => setGpos && setGpos(e.target.value)} className="w-full p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-xs" placeholder="GPOS Tag" />
                        </div>
                    </div>
                </div>
            )}

            {type === 'kerning' && (
                 <div className="space-y-3">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <SmartGlyphInput 
                                value={kernComps[0]} 
                                onChange={v => setKernComps([v, kernComps[1]])} 
                                characterSets={allCharacterSets!} 
                                groups={{}} 
                                showSets={false} 
                                placeholder="Left" 
                            />
                        </div>
                        <div className="flex-1">
                            <SmartGlyphInput 
                                value={kernComps[1]} 
                                onChange={v => setKernComps([kernComps[0], v])} 
                                characterSets={allCharacterSets!} 
                                groups={{}} 
                                showSets={false} 
                                placeholder="Right" 
                            />
                        </div>
                    </div>
                </div>
            )}

            {type !== 'drawing' && (
                <button 
                    onClick={handleApplyConstruction}
                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <SaveIcon className="w-4 h-4" />
                    Apply Changes
                </button>
            )}
        </div>
        )}
      </div>
      )}
    </div>
    </>
  );
};

export default GlyphPropertiesPanel;
