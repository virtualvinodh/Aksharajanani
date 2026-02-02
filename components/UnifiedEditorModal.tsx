import React, { useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, CharacterSet, MarkAttachmentRules, Point, Path, ComponentTransform } from '../types';
import { useLayout } from '../contexts/LayoutContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import { updatePositioningAndCascade } from '../services/positioningService';
import { getAccurateGlyphBBox, calculateDefaultMarkOffset, generateCompositeGlyphData } from '../services/glyphRenderService';
import { deepClone } from '../utils/cloneUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { GridViewIcon } from '../constants';
import { useGlyphFilter } from '../hooks/useGlyphFilter';

// Specialized Editor Pages
import DrawingModal from './DrawingModal';
import PositioningEditorPage from './PositioningEditorPage';
import KerningEditorPage from './KerningEditorPage';

type EditorProfile = 'drawing' | 'positioning' | 'kerning';

interface UnifiedEditorModalProps {
    mode?: 'modal' | 'panel';
    character: Character;
    characterSet: CharacterSet;
    glyphData: GlyphData | undefined;
    onSave: (unicode: number, data: GlyphData, metadata: any, onSuccess?: () => void, options?: any) => void;
    onDelete: (unicode: number) => void;
    onUnlockGlyph: (unicode: number) => void;
    onRelinkGlyph: (unicode: number) => void;
    onUpdateDependencies: (unicode: number, components: string[] | null) => void;
    onNavigate: (character: Character) => void;
    settings: AppSettings;
    metrics: FontMetrics;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    gridConfig: { characterNameSize: number };
    clipboard: Path[] | null;
    setClipboard: (paths: Path[] | null) => void;
    onClose: () => void;
    markAttachmentRules: MarkAttachmentRules | null;
    onEditorModeChange: (mode: 'simple' | 'advanced') => void;
    isClosing?: boolean;
}

const UnifiedEditorModal: React.FC<UnifiedEditorModalProps> = ({ 
    mode = 'modal',
    character: propCharacter, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, 
    settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, 
    onUnlockGlyph, onRelinkGlyph, onUpdateDependencies, onEditorModeChange, isClosing
}) => {
  const { showNotification, filterMode, searchQuery, openNavDrawer } = useLayout();
  const { 
    allCharsByName, allCharsByUnicode, positioningRules, recommendedKerning, 
    markAttachmentClasses, baseAttachmentClasses, dispatch: characterDispatch 
  } = useProject();
  const { kerningMap, dispatch: kerningDispatch } = useKerning();
  const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
  const { version: glyphVersion, dispatch: glyphDataDispatch } = useGlyphDataContext();
  const { state: rulesState } = useRules();
  const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);

  const character = useMemo(() => {
    if (propCharacter.unicode !== undefined) {
        return allCharsByUnicode.get(propCharacter.unicode) || propCharacter;
    }
    return allCharsByName.get(propCharacter.name) || propCharacter;
  }, [propCharacter, allCharsByUnicode, allCharsByName]);

  const profile = useMemo<EditorProfile>(() => {
    if (character.position) return 'positioning';
    if (character.kern) return 'kerning';
    return 'drawing';
  }, [character]);

  // Pre-filter characters for navigation availability
  const availableChars = useMemo(() => {
      let chars = allCharacterSets.flatMap(s => s.characters);
      // Remove hard-excluded chars
      chars = chars.filter(c => !c.hidden && c.unicode !== 8205 && c.unicode !== 8204);
      
      // Filter for component readiness (only navigate to virtuals if components exist)
      chars = chars.filter(c => {
          if (c.position) {
              const base = allCharsByName.get(c.position[0]);
              const mark = allCharsByName.get(c.position[1]);
              if (!base || !mark || base.unicode === undefined || mark.unicode === undefined) return false;
              const baseDrawn = isGlyphDrawn(allGlyphData.get(base.unicode));
              const markDrawn = isGlyphDrawn(allGlyphData.get(mark.unicode));
              return baseDrawn && markDrawn;
          }
          if (c.kern) {
              const left = allCharsByName.get(c.kern[0]);
              const right = allCharsByName.get(c.kern[1]);
              if (!left || !right || left.unicode === undefined || right.unicode === undefined) return false;
              const leftDrawn = isGlyphDrawn(allGlyphData.get(left.unicode));
              const rightDrawn = isGlyphDrawn(allGlyphData.get(right.unicode));
              return leftDrawn && rightDrawn;
          }
          if (c.link) {
              return c.link.every(name => {
                  const comp = allCharsByName.get(name);
                  return comp && comp.unicode !== undefined && isGlyphDrawn(allGlyphData.get(comp.unicode));
              });
          }
          return true;
      });
      return chars;
  }, [allCharacterSets, allCharsByName, allGlyphData, glyphVersion]);

  // Apply Search and Filter Mode using hook
  const { filteredList: navigationList } = useGlyphFilter({
      characters: availableChars,
      glyphDataMap: allGlyphData,
      markPositioningMap,
      kerningMap,
      allCharsByName,
      showHidden: true // We already filtered hidden manually based on availability logic
  });

  const currentIndex = navigationList.findIndex(c => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? navigationList[currentIndex - 1] : null;
  const nextCharacter = currentIndex !== -1 && currentIndex < navigationList.length - 1 ? navigationList[currentIndex + 1] : null;

  const handlePageNavigate = useCallback((target: Character | 'prev' | 'next') => {
      if (target === 'prev' && prevCharacter) onNavigate(prevCharacter);
      else if (target === 'next' && nextCharacter) onNavigate(nextCharacter);
      else if (typeof target === 'object') onNavigate(target);
  }, [onNavigate, prevCharacter, nextCharacter]);

  const allLigaturesByKey = useMemo(() => {
      const map = new Map<string, Character>();
      if (!allCharacterSets || !allCharsByName) return map;
      allCharacterSets.forEach(set => {
          set.characters.forEach(c => {
              if (c.position && c.position.length === 2) {
                  const base = allCharsByName.get(c.position[0]);
                  const mark = allCharsByName.get(c.position[1]);
                  if (base && mark && base.unicode !== undefined && mark.unicode !== undefined) {
                      map.set(`${base.unicode}-${mark.unicode}`, c);
                  }
              }
          });
      });
      if (positioningRules) {
          let virtualId = 0x100000;
          positioningRules.forEach(rule => {
              const bases = expandMembers(rule.base, groups, allCharacterSets);
              const marks = expandMembers(rule.mark || [], groups, allCharacterSets);
              bases.forEach(bName => {
                  marks.forEach(mName => {
                      const bChar = allCharsByName.get(bName);
                      const mChar = allCharsByName.get(mName);
                      if (bChar && mChar && bChar.unicode !== undefined && mChar.unicode !== undefined) {
                          const key = `${bChar.unicode}-${mChar.unicode}`;
                          if (!map.has(key)) {
                              map.set(key, { name: bName + mName, unicode: virtualId++, position: [bName, mName], glyphClass: 'ligature' });
                          }
                      }
                  });
              });
          });
      }
      return map;
  }, [allCharacterSets, allCharsByName, positioningRules, groups]);

  const handlePositioningSave = useCallback((base: Character, mark: Character, targetLig: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: any, isAutosave?: boolean, isManual?: boolean) => {
    const result = updatePositioningAndCascade({
        baseChar: base, markChar: mark, targetLigature: targetLig, newGlyphData, newOffset, newBearings,
        allChars: allCharsByName, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses,
        markPositioningMap, glyphDataMap: allGlyphData, characterSets: allCharacterSets, positioningRules,
        markAttachmentRules, groups, strokeThickness: settings.strokeThickness, metrics, isManual
    });
    positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
    glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
    characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });
    if (!isAutosave) {
        const propagatedCount = result.updatedMarkPositioningMap.size - markPositioningMap.size - 1;
        if (propagatedCount > 0) showNotification(`Saved and propagated to ${propagatedCount} similar pairs.`, 'success');
        else showNotification(`Positioning saved.`, 'success');
    }
  }, [allCharsByName, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses, markPositioningMap, allGlyphData, allCharacterSets, positioningRules, markAttachmentRules, groups, settings.strokeThickness, metrics, positioningDispatch, glyphDataDispatch, characterDispatch, showNotification]);

  const handleConfirmPosition = useCallback((base: Character, mark: Character, ligature: Character) => {
    const baseGlyph = allGlyphData.get(base.unicode!);
    const markGlyph = allGlyphData.get(mark.unicode!);
    if (!baseGlyph || !markGlyph || !metrics || !allCharacterSets || !settings) return;
    const rule = positioningRules?.find(r => expandMembers(r.base, groups, allCharacterSets).includes(base.name) && expandMembers(r.mark, groups, allCharacterSets).includes(mark.name));
    const constraint = (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) ? rule.movement : 'none';
    const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
    const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
    const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, allCharacterSets, false, groups, constraint);
    const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({ ...p, points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })), segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined }));
    handlePositioningSave(base, mark, ligature, { paths: [...baseGlyph.paths, ...transformedMarkPaths] }, offset, { lsb: ligature.lsb, rsb: ligature.rsb, glyphClass: ligature.glyphClass, advWidth: ligature.advWidth, gsub: ligature.gsub, gpos: ligature.gpos, liga: ligature.liga }, true, false);
  }, [allGlyphData, metrics, allCharacterSets, settings, positioningRules, groups, markAttachmentRules, handlePositioningSave]);
  
  const handleConvertToComposite = useCallback((newTransforms: ComponentTransform[]) => {
      const components = character.position || character.kern;
      if (!components || !character.unicode) return;
      const newChar = { ...character };
      if (character.position) { newChar.sourceLink = character.position; newChar.sourceLinkType = 'position'; }
      else if (character.kern) { newChar.sourceLink = character.kern; newChar.sourceLinkType = 'kern'; }
      delete newChar.position; delete newChar.kern;
      
      // Save original class before conversion to ligature
      newChar.sourceGlyphClass = character.glyphClass;
      
      newChar.composite = components; newChar.compositeTransform = newTransforms; newChar.glyphClass = 'ligature';
      if (character.position) {
           const base = allCharsByName.get(components[0]); const mark = allCharsByName.get(components[1]);
           if (base && mark) { const key = `${base.unicode}-${mark.unicode}`; const newMap = new Map(markPositioningMap); newMap.delete(key); positioningDispatch({ type: 'SET_MAP', payload: newMap }); }
      } else if (character.kern) {
           const left = allCharsByName.get(components[0]); const right = allCharsByName.get(components[1]);
           if (left && right) { const key = `${left.unicode}-${right.unicode}`; const newMap = new Map(kerningMap); newMap.delete(key); kerningDispatch({ type: 'SET_MAP', payload: newMap }); }
      }
      const compositeData = generateCompositeGlyphData({ character: newChar, allCharsByName, allGlyphData, settings, metrics, markAttachmentRules, allCharacterSets, groups });
      if (compositeData) glyphDataDispatch({ type: 'SET_GLYPH', payload: { unicode: newChar.unicode, data: compositeData } });
      characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets: CharacterSet[] | null) => prevSets ? prevSets.map(set => ({ ...set, characters: set.characters.map(c => c.unicode === newChar.unicode ? newChar : c) })) : null });
      onNavigate(newChar);
      showNotification("Converted to standard composite glyph.", "success");
  }, [character, markPositioningMap, kerningMap, allCharsByName, allGlyphData, settings, metrics, markAttachmentRules, allCharacterSets, groups, positioningDispatch, kerningDispatch, glyphDataDispatch, characterDispatch, showNotification, onNavigate]);

  const renderActivePage = () => {
    const pageKey = character.unicode || character.name;
    switch(profile) {
        case 'kerning': {
            const kernLeftChar = allCharsByName.get(character.kern![0]);
            const kernRightChar = allCharsByName.get(character.kern![1]);
            const key = `${kernLeftChar?.unicode}-${kernRightChar?.unicode}`;
            return (
                <KerningEditorPage
                    key={pageKey} pair={{ left: kernLeftChar!, right: kernRightChar! }} initialValue={kerningMap.get(key) ?? 0}
                    glyphDataMap={allGlyphData} strokeThickness={settings.strokeThickness} metrics={metrics} settings={settings}
                    recommendedKerning={recommendedKerning} onSave={(val) => { const newMap = new Map(kerningMap); newMap.set(key, val); kerningDispatch({ type: 'SET_MAP', payload: newMap }); }}
                    onRemove={() => { const newMap = new Map(kerningMap); newMap.delete(key); kerningDispatch({ type: 'SET_MAP', payload: newMap }); onClose(); }}
                    onClose={() => onClose()} onDelete={() => onDelete(character.unicode!)} onNavigate={handlePageNavigate}
                    hasPrev={!!prevCharacter} hasNext={!!nextCharacter} glyphVersion={glyphVersion} isKerned={kerningMap.has(key)}
                    allCharacterSets={allCharacterSets} onConvertToComposite={handleConvertToComposite} allCharsByName={allCharsByName} character={character}
                />
            );
        }
        case 'positioning': {
            const posBaseChar = allCharsByName.get(character.position?.[0]!) || character;
            const posMarkChar = allCharsByName.get(character.position?.[1]!) || character;
            return (
                <PositioningEditorPage
                    key={pageKey} baseChar={posBaseChar} markChar={posMarkChar} targetLigature={character} glyphDataMap={allGlyphData} markPositioningMap={markPositioningMap}
                    onSave={handlePositioningSave} onConfirmPosition={handleConfirmPosition} onClose={() => onClose()} onDelete={() => onDelete(character.unicode!)}
                    onReset={(b, m, l) => { const key = `${b.unicode}-${m.unicode}`; const newMap = new Map(markPositioningMap); newMap.delete(key); positioningDispatch({ type: 'SET_MAP', payload: newMap }); }}
                    settings={settings} metrics={metrics} markAttachmentRules={markAttachmentRules} positioningRules={positioningRules} allChars={allCharsByName}
                    onNavigate={handlePageNavigate} hasPrev={!!prevCharacter} hasNext={!!nextCharacter} setEditingPair={(pair: any) => handlePageNavigate(pair.ligature)}
                    characterSets={allCharacterSets} glyphVersion={glyphVersion} allLigaturesByKey={allLigaturesByKey} onConvertToComposite={handleConvertToComposite}
                />
            );
        }
        default:
            return (
                <DrawingModal
                    key={pageKey} character={character} characterSet={characterSet} glyphData={glyphData} onSave={onSave} onClose={() => onClose()}
                    onDelete={onDelete} onNavigate={onNavigate} prevCharacter={prevCharacter} nextCharacter={nextCharacter}
                    settings={settings} metrics={metrics} allGlyphData={allGlyphData} allCharacterSets={allCharacterSets}
                    gridConfig={gridConfig} markAttachmentRules={markAttachmentRules} onUnlockGlyph={onUnlockGlyph}
                    onRelinkGlyph={onRelinkGlyph} onUpdateDependencies={onUpdateDependencies} onEditorModeChange={onEditorModeChange}
                />
            );
    }
  };

  if (mode === 'panel') {
      return (
          <div className="h-full w-full flex flex-col">
              {renderActivePage()}
          </div>
      );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
        {/* Floating Nav Button */}
        <button
            onClick={openNavDrawer}
            className="absolute top-1/2 -translate-y-1/2 left-0 z-[60] w-6 h-20 bg-indigo-600/80 backdrop-blur-sm text-white rounded-r-lg shadow-lg flex items-center justify-center transition-transform hover:bg-indigo-500 active:translate-x-1"
            title="Open Character Grid"
        >
            <GridViewIcon className="w-4 h-4" />
        </button>
      
        <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
            {renderActivePage()}
        </div>
    </div>
  );
};

export default React.memo(UnifiedEditorModal);
