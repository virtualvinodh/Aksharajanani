
import React, { useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, CharacterSet, MarkAttachmentRules, Point } from '../types';
import { useLayout } from '../contexts/LayoutContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { expandMembers } from '../services/groupExpansionService';
import { updatePositioningAndCascade } from '../services/positioningService';

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
  const { modalOriginRect, showNotification } = useLayout();
  const { 
    allCharsByName, positioningRules, recommendedKerning, 
    markAttachmentClasses, baseAttachmentClasses, dispatch: characterDispatch 
  } = useProject();
  const { kerningMap, dispatch: kerningDispatch } = useKerning();
  const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
  const { version: glyphVersion, dispatch: glyphDataDispatch } = useGlyphDataContext();
  const { state: rulesState } = useRules();
  const groups = useMemo(() => rulesState.fontRules?.groups || {}, [rulesState.fontRules]);

  const modalRef = useRef<HTMLDivElement>(null);
  const [animationClass, setAnimationClass] = useState('');
  const animationTimeoutRef = useRef<number | null>(null);

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

  const triggerClose = useCallback((postAnimationCallback: () => void) => {
    if (modalOriginRect) {
        setAnimationClass('animate-modal-exit');
        animationTimeoutRef.current = window.setTimeout(() => { setAnimationClass(''); postAnimationCallback(); }, 300);
    } else {
        postAnimationCallback();
    }
  }, [modalOriginRect]);

  useLayoutEffect(() => {
    if (modalOriginRect && modalRef.current) {
        const modalEl = modalRef.current;
        modalEl.style.setProperty('--modal-origin-x', `${modalOriginRect.left + modalOriginRect.width / 2}px`);
        modalEl.style.setProperty('--modal-origin-y', `${modalOriginRect.top + modalOriginRect.height / 2}px`);
        modalEl.style.setProperty('--modal-scale-x', (modalOriginRect.width / window.innerWidth).toFixed(5));
        modalEl.style.setProperty('--modal-scale-y', (modalOriginRect.height / window.innerHeight).toFixed(5));
        setAnimationClass('animate-modal-enter');
        animationTimeoutRef.current = window.setTimeout(() => setAnimationClass(''), 300);
    }
  }, [modalOriginRect]);

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
                        triggerClose(onClose);
                    }}
                    onClose={() => triggerClose(onClose)}
                    onNavigate={(dir) => handlePageNavigate(dir)}
                    hasPrev={!!prevCharacter}
                    hasNext={!!nextCharacter}
                    glyphVersion={glyphVersion}
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
                    onClose={() => triggerClose(onClose)}
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
                    onClose={() => triggerClose(onClose)}
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
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
        <div className="flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
            {renderActivePage()}
        </div>
    </div>
  );
};

export default React.memo(UnifiedEditorModal);
