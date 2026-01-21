import React, { useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, CharacterSet, MarkAttachmentRules, Point, Path } from '../types';
import { useLayout } from '../contexts/LayoutContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import { updatePositioningAndCascade } from '../services/positioningService';
import { getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../services/glyphRenderService';
import { deepClone } from '../utils/cloneUtils';

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

  const visibleCharactersForNav = useMemo(() => characterSet?.characters.filter((c: any) => !c.hidden) || [], [characterSet]);
  const currentIndex = visibleCharactersForNav.findIndex((c: any) => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;

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
                    onNavigate={(dir) => handlePageNavigate(dir)}
                    hasPrev={!!prevCharacter}
                    hasNext={!!nextCharacter}
                    glyphVersion={glyphVersion}
                    isKerned={kerningMap.has(key)}
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