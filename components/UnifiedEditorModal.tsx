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

// Specialized Editor Pages
import DrawingModal from './DrawingModal';
import PositioningEditorPage from './PositioningEditorPage';
import KerningEditorPage from './KerningEditorPage';

type EditorProfile = 'drawing' | 'positioning' | 'kerning';

const UnifiedEditorModal: React.FC<any> = ({ 
    character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, 
    settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, 
    onUnlockGlyph, onRelinkGlyph, onUpdateDependencies, onEditorModeChange 
}) => {
  const { showNotification } = useLayout();
  const { 
    allCharsByName, positioningRules, recommendedKerning, 
    markAttachmentClasses, baseAttachmentClasses, dispatch: characterDispatch 
  } = useProject();
  const { kerningMap, dispatch: kerningDispatch } = useKerning();
  const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
  const { version: glyphVersion, dispatch: glyphDataDispatch } = useGlyphDataContext();
  const { state: rulesState } = useRules();
  const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);

  const profile = useMemo<EditorProfile>(() => {
    if (character.position) return 'positioning';
    if (character.kern) return 'kerning';
    return 'drawing';
  }, [character]);

  // Helper to determine if a glyph is "Available" (i.e. not disabled in the grid)
  // Standard glyphs are always available. Virtual glyphs (Pos/Kern) need their components drawn.
  const isCharNavigable = useCallback((c: Character) => {
    if (c.hidden) return false;

    // Positioning Pair Logic
    if (c.position) {
        const base = allCharsByName.get(c.position[0]);
        const mark = allCharsByName.get(c.position[1]);
        if (!base || !mark || base.unicode === undefined || mark.unicode === undefined) return false;
        
        // Both components must be drawn
        const baseDrawn = isGlyphDrawn(allGlyphData.get(base.unicode));
        const markDrawn = isGlyphDrawn(allGlyphData.get(mark.unicode));
        return baseDrawn && markDrawn;
    }

    // Kerning Pair Logic
    if (c.kern) {
        const left = allCharsByName.get(c.kern[0]);
        const right = allCharsByName.get(c.kern[1]);
        if (!left || !right || left.unicode === undefined || right.unicode === undefined) return false;

        // Both components must be drawn
        const leftDrawn = isGlyphDrawn(allGlyphData.get(left.unicode));
        const rightDrawn = isGlyphDrawn(allGlyphData.get(right.unicode));
        return leftDrawn && rightDrawn;
    }

    // Standard Glyph
    return true;
  }, [allCharsByName, allGlyphData]);

  const visibleCharactersForNav = useMemo(() => {
      if (!characterSet?.characters) return [];
      return characterSet.characters.filter(isCharNavigable);
  }, [characterSet, isCharNavigable]);

  const currentIndex = visibleCharactersForNav.findIndex((c: any) => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex !== -1 && currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;

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
                              map.set(key, {
                                  name: bName + mName,
                                  unicode: virtualId++,
                                  position: [bName, mName],
                                  glyphClass: 'ligature'
                              });
                          }
                      }
                  });
              });
          });
      }
      return map;
  }, [allCharacterSets, allCharsByName, positioningRules, groups]);

  const handlePositioningSave = useCallback((base: Character, mark: Character, targetLig: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }, isAutosave?: boolean) => {
    
    const result = updatePositioningAndCascade({
        baseChar: base,
        markChar: mark,
        targetLigature: targetLig,
        newGlyphData,
        newOffset,
        newBearings,
        allChars: allCharsByName,
        allLigaturesByKey,
        markAttachmentClasses,
        baseAttachmentClasses,
        markPositioningMap,
        glyphDataMap: allGlyphData,
        characterSets: allCharacterSets,
        positioningRules,
        markAttachmentRules,
        groups,
        strokeThickness: settings.strokeThickness,
        metrics
    });

    positioningDispatch({ type: 'SET_MAP', payload: result.updatedMarkPositioningMap });
    glyphDataDispatch({ type: 'SET_MAP', payload: result.updatedGlyphDataMap });
    characterDispatch({ type: 'SET_CHARACTER_SETS', payload: result.updatedCharacterSets });

    if (!isAutosave) {
        const propagatedCount = result.updatedMarkPositioningMap.size - markPositioningMap.size - 1;
        if (propagatedCount > 0) {
            showNotification(`Saved and propagated to ${propagatedCount} similar pairs.`, 'success');
        } else {
            showNotification(`Positioning saved.`, 'success');
        }
    }
  }, [allCharsByName, allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses, markPositioningMap, allGlyphData, allCharacterSets, positioningRules, markAttachmentRules, groups, settings.strokeThickness, metrics, positioningDispatch, glyphDataDispatch, characterDispatch, showNotification]);

  const handleConfirmPosition = useCallback((base: Character, mark: Character, ligature: Character) => {
    const baseGlyph = allGlyphData.get(base.unicode);
    const markGlyph = allGlyphData.get(mark.unicode);
    if (!baseGlyph || !markGlyph || !metrics || !allCharacterSets || !settings) return;

    const rule = positioningRules?.find(r => 
        expandMembers(r.base, groups, allCharacterSets).includes(base.name) && 
        expandMembers(r.mark, groups, allCharacterSets).includes(mark.name)
    );
    const constraint = (rule && (rule.movement === 'horizontal' || rule.movement === 'vertical')) ? rule.movement : 'none';

    const baseBbox = getAccurateGlyphBBox(baseGlyph.paths, settings.strokeThickness);
    const markBbox = getAccurateGlyphBBox(markGlyph.paths, settings.strokeThickness);
    const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, allCharacterSets, false, groups, constraint);

    const transformedMarkPaths = deepClone(markGlyph.paths).map((p: Path) => ({
        ...p,
        points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
    }));
    const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
    const newGlyphData = { paths: combinedPaths };
    const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb };
    
    handlePositioningSave(base, mark, ligature, newGlyphData, offset, newBearings, true);
  }, [allGlyphData, metrics, allCharacterSets, settings, positioningRules, groups, markAttachmentRules, handlePositioningSave]);
  
  const handleConvertToComposite = useCallback((newTransforms: ComponentTransform[]) => {
      const components = character.position || character.kern;
      if (!components || !character.unicode) return;
      
      const newChar = { ...character };
      delete newChar.position;
      delete newChar.kern;
      
      newChar.composite = components;
      newChar.compositeTransform = newTransforms;
      newChar.glyphClass = 'ligature';
      
      // 1. Clear Rule Map
      if (character.position) {
           const base = allCharsByName.get(components[0]);
           const mark = allCharsByName.get(components[1]);
           if (base && mark) {
               const key = `${base.unicode}-${mark.unicode}`;
               const newMap = new Map(markPositioningMap);
               newMap.delete(key);
               positioningDispatch({ type: 'SET_MAP', payload: newMap });
           }
      } else if (character.kern) {
           const left = allCharsByName.get(components[0]);
           const right = allCharsByName.get(components[1]);
           if (left && right) {
               const key = `${left.unicode}-${right.unicode}`;
               const newMap = new Map(kerningMap);
               newMap.delete(key);
               kerningDispatch({ type: 'SET_MAP', payload: newMap });
           }
      }
      
      // 2. Generate and Set Glyph Data immediately
      const compositeData = generateCompositeGlyphData({ 
          character: newChar, 
          allCharsByName, 
          allGlyphData, 
          settings, 
          metrics, 
          markAttachmentRules, 
          allCharacterSets, 
          groups 
      });
      if (compositeData) {
          glyphDataDispatch({ type: 'SET_GLYPH', payload: { unicode: newChar.unicode, data: compositeData } });
      }

      // 3. Update Character Definition
      characterDispatch({
          type: 'UPDATE_CHARACTER_SETS',
          payload: (prevSets: CharacterSet[] | null) => {
              if (!prevSets) return null;
              return prevSets.map(set => ({
                  ...set,
                  characters: set.characters.map(c => {
                      if (c.unicode === newChar.unicode) {
                          return newChar;
                      }
                      return c;
                  })
              }));
          }
      });
      
      // 4. Force update of the selected character in LayoutContext to reflect schema change immediately
      onNavigate(newChar);

      showNotification("Converted to standard composite glyph.", "success");

  }, [character, markPositioningMap, kerningMap, allCharsByName, allGlyphData, settings, metrics, markAttachmentRules, allCharacterSets, groups, positioningDispatch, kerningDispatch, glyphDataDispatch, characterDispatch, showNotification, onNavigate]);

  const renderActivePage = () => {
    const pageKey = character.unicode || character.name;

    switch(profile) {
        case 'kerning': {
            const kernLeftChar = allCharsByName.get(character.kern[0]);
            const kernRightChar = allCharsByName.get(character.kern[1]);
            const key = `${kernLeftChar?.unicode}-${kernRightChar?.unicode}`;
            return (
                <KerningEditorPage
                    key={pageKey}
                    pair={{ left: kernLeftChar!, right: kernRightChar! }}
                    initialValue={kerningMap.get(key) ?? 0}
                    glyphDataMap={allGlyphData}
                    strokeThickness={settings.strokeThickness}
                    metrics={metrics}
                    settings={settings}
                    recommendedKerning={recommendedKerning}
                    onSave={(val) => {
                        const newMap = new Map(kerningMap);
                        newMap.set(key, val);
                        kerningDispatch({ type: 'SET_MAP', payload: newMap });
                    }}
                    onRemove={() => {
                        const newMap = new Map(kerningMap);
                        newMap.delete(key);
                        kerningDispatch({ type: 'SET_MAP', payload: newMap });
                        onClose();
                    }}
                    onClose={() => onClose()}
                    onDelete={() => onDelete(character.unicode)}
                    onNavigate={(dir) => handlePageNavigate(dir)}
                    hasPrev={!!prevCharacter}
                    hasNext={!!nextCharacter}
                    glyphVersion={glyphVersion}
                    isKerned={kerningMap.has(key)}
                    allCharacterSets={allCharacterSets}
                    onConvertToComposite={handleConvertToComposite}
                />
            );
        }

        case 'positioning': {
            const posBaseChar = allCharsByName.get(character.position?.[0]) || character;
            const posMarkChar = allCharsByName.get(character.position?.[1]) || character;
            
            return (
                <PositioningEditorPage
                    key={pageKey}
                    baseChar={posBaseChar}
                    markChar={posMarkChar}
                    targetLigature={character}
                    glyphDataMap={allGlyphData}
                    markPositioningMap={markPositioningMap}
                    onSave={handlePositioningSave}
                    onConfirmPosition={handleConfirmPosition}
                    onClose={() => onClose()}
                    onDelete={() => onDelete(character.unicode)}
                    onReset={(b, m, l) => {
                        const key = `${b.unicode}-${m.unicode}`;
                        const newMap = new Map(markPositioningMap);
                        newMap.delete(key);
                        positioningDispatch({ type: 'SET_MAP', payload: newMap });
                    }}
                    settings={settings}
                    metrics={metrics}
                    markAttachmentRules={markAttachmentRules}
                    positioningRules={positioningRules}
                    allChars={allCharsByName}
                    onNavigate={(dir) => handlePageNavigate(dir)}
                    hasPrev={!!prevCharacter}
                    hasNext={!!nextCharacter}
                    setEditingPair={(pair: any) => handlePageNavigate(pair.ligature)}
                    characterSets={allCharacterSets}
                    glyphVersion={glyphVersion}
                    allLigaturesByKey={allLigaturesByKey}
                    onConvertToComposite={handleConvertToComposite}
                />
            );
        }

        default:
            return (
                <DrawingModal
                    key={pageKey}
                    character={character}
                    characterSet={characterSet}
                    glyphData={glyphData}
                    onSave={onSave}
                    onClose={() => onClose()}
                    onDelete={onDelete}
                    onNavigate={onNavigate}
                    settings={settings}
                    metrics={metrics}
                    allGlyphData={allGlyphData}
                    allCharacterSets={allCharacterSets}
                    gridConfig={gridConfig}
                    markAttachmentRules={markAttachmentRules}
                    onUnlockGlyph={onUnlockGlyph}
                    onRelinkGlyph={onRelinkGlyph}
                    onUpdateDependencies={onUpdateDependencies}
                    onEditorModeChange={onEditorModeChange}
                />
            );
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
        <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
            {renderActivePage()}
        </div>
    </div>
  );
};

export default React.memo(UnifiedEditorModal);