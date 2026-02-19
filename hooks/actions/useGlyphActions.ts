
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useKerning, QueuedPair } from '../../contexts/KerningContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { Character, GlyphData, Path, Point, CharacterSet, ComponentTransform } from '../../types';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData, updateComponentInPaths, getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../../services/glyphRenderService';
import { VEC } from '../../utils/vectorUtils';
import * as dbService from '../../services/dbService';
import { deepClone } from '../../utils/cloneUtils';
import { useRules } from '../../contexts/RulesContext';
import { expandMembers } from '../../services/groupExpansionService';

declare var UnicodeProperties: any;

export interface SaveOptions {
    isDraft?: boolean;
    silent?: boolean;
}

// Standard names that should map to specific Unicode points instead of PUA
const STANDARD_NAMES: Record<string, number> = {
    'space': 32,
    'nbsp': 160,
    'zwnj': 8204,
    'zwj': 8205
};

let cascadeWorker: Worker | null = null;
let workerUrl: string | null = null;

const workerCode = `
    // Load paper.js library inside the worker
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js');

    // --- SELF-CONTAINED DEPENDENCIES ---

    const paperScope = new paper.PaperScope();
    paperScope.setup(new paper.Size(1, 1));

    const VEC = {
        add: (p1, p2) => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
        sub: (p1, p2) => ({ x: p1.x - p2.x, y: p1.y - p2.y }),
        scale: (p, s) => ({ x: p.x * s, y: p.y * s }),
        len: (p) => Math.sqrt(p.x * p.x + p.y * p.y),
        normalize: (p) => {
            const l = Math.sqrt(p.x * p.x + p.y * p.y);
            return l > 1e-6 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 };
        },
        perp: (p) => ({ x: -p.y, y: p.x }),
        dot: (p1, p2) => p1.x * p2.x + p1.y * p2.y,
        rotate: (p, angle) => ({
            x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
            y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
        }),
    };

    const isGlyphDrawn = (glyphData) => {
      if (!glyphData || !glyphData.paths || glyphData.paths.length === 0) return false;
      return glyphData.paths.some(p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0);
    };
    
    function deepClone(value) {
      if (value instanceof Map) {
        return new Map(Array.from(value.entries()).map(([k, v]) => [k, deepClone(v)]));
      }
      if (value instanceof Set) {
        return new Set(Array.from(value.values()).map(v => deepClone(v)));
      }
      if (Array.isArray(value)) {
        return value.map(item => deepClone(item));
      }
      if (value && typeof value === 'object') {
        const copy = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                copy[key] = deepClone(value[key]);
            }
        }
        return copy;
      }
      return value;
    }

    const expandMembers = (items, groups, characterSets) => {
        if (!items || items.length === 0) return [];
        const result = new Set();
        const visitedGroups = new Set();

        const processItem = (item) => {
            const trimmed = item.trim();
            if (!trimmed) return;

            if (trimmed.startsWith('$') || trimmed.startsWith('@')) {
                const groupName = trimmed.substring(1);
                if (visitedGroups.has(groupName)) return;
                visitedGroups.add(groupName);

                let groupMembers = groups[groupName];
                if (!groupMembers && characterSets) {
                    const set = characterSets.find(s => s.nameKey === groupName);
                    if (set) groupMembers = set.characters.map(c => c.name);
                }
                if (groupMembers) groupMembers.forEach(member => processItem(member));
            } else {
                result.add(trimmed);
            }
        };

        items.forEach(item => processItem(item));
        return Array.from(result);
    };

    const quadraticCurveToPolyline = (points, density = 10) => {
      if (points.length !== 3) return points;
      const [p0, p1, p2] = points;
      const polyline = [p0];
      const quadraticPoint = (t, p0, p1, p2) => {
          const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
          const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
          return { x, y };
      };
      for (let j = 1; j <= density; j++) {
          polyline.push(quadraticPoint(j / density, p0, p1, p2));
      }
      return polyline;
    };

    const curveToPolyline = (points, density = 15) => {
      if (points.length < 3) return points;
      const polyline = [points[0]];
      const quadraticPoint = (t, p0, p1, p2) => {
          const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
          const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
          return { x, y };
      };
      let p0 = points[0];
      for (let i = 1; i < points.length - 2; i++) {
          const p1 = points[i];
          const p2 = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
          for (let j = 1; j <= density; j++) {
              polyline.push(quadraticPoint(j / density, p0, p1, p2));
          }
          p0 = p2;
      }
      const lastIndex = points.length - 1;
      const p1 = points[lastIndex - 1];
      const p2 = points[lastIndex];
      for (let j = 1; j <= density; j++) {
          polyline.push(quadraticPoint(j / density, p0, p1, p2));
      }
      return polyline;
    };

    const getAccurateGlyphBBox = (data, strokeThickness) => {
      let paths;
      if (Array.isArray(data)) {
          paths = data;
      } else {
          paths = data.paths;
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let hasContent = false;
      paperScope.project.clear();
      paths.forEach(path => {
          if (path.type === 'outline' && path.segmentGroups) {
              hasContent = true;
              let paperItem;
              const createPaperPath = (segments) => new paperScope.Path({ 
                  segments: segments.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))), 
                  closed: true 
              });
              if (path.segmentGroups.length > 1) {
                  paperItem = new paperScope.CompoundPath({ children: path.segmentGroups.map(createPaperPath), fillRule: 'evenodd' });
              } else if (path.segmentGroups.length === 1) {
                  paperItem = createPaperPath(path.segmentGroups[0]);
              }
              if (paperItem && paperItem.bounds && paperItem.bounds.width > 0) {
                  const { x, y, width, height } = paperItem.bounds;
                  minX = Math.min(minX, x); maxX = Math.max(maxX, x + width); minY = Math.min(minY, y); maxY = Math.max(maxY, y + height);
              }
              return;
          }
          if (path.points.length === 0) return;
          hasContent = true;
          if (path.type === 'dot') {
              const center = path.points[0];
              const radius = path.points.length > 1 ? VEC.len(VEC.sub(path.points.length > 1 ? path.points[1] : path.points[0], center)) : strokeThickness / 2;
              minX = Math.min(minX, center.x - radius); maxX = Math.max(maxX, center.x + radius); minY = Math.min(minY, center.y - radius); maxY = Math.max(maxY, center.y + radius);
          } else {
              let pointsToTest;
              if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) pointsToTest = curveToPolyline(path.points);
              else if (path.type === 'curve' && path.points.length === 3) pointsToTest = quadraticCurveToPolyline(path.points);
              else pointsToTest = path.points;
              let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
              pointsToTest.forEach(point => {
                  pMinX = Math.min(pMinX, point.x); pMaxX = Math.max(pMaxX, point.x); pMinY = Math.min(pMinY, point.y); pMaxY = Math.max(pMaxY, point.y);
              });
              const halfStroke = strokeThickness / 2;
              minX = Math.min(minX, pMinX - halfStroke); maxX = Math.max(maxX, pMaxX + halfStroke); minY = Math.min(minY, pMinY - halfStroke); maxY = Math.max(maxY, pMaxY + halfStroke);
          }
      });
      return hasContent ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
    };

    const getAttachmentPointCoords = (bbox, pointName) => {
      const { x, y, width, height } = bbox;
      switch (pointName) {
          case 'topLeft': return { x, y }; case 'topCenter': return { x: x + width / 2, y }; case 'topRight': return { x: x + width, y };
          case 'midLeft': return { x, y: y + height / 2 }; case 'midRight': return { x: x + width, y: y + height / 2 };
          case 'bottomLeft': return { x, y: y + height }; case 'bottomCenter': return { x: x + width / 2, y: y + height }; case 'bottomRight': return { x: x + width, y: y + height };
          default: return { x, y };
      }
    };
    
    const resolveAttachmentRule = (baseName, markName, markAttachmentRules, characterSets, groups) => {
      if (!markAttachmentRules) return null;
      let rule = markAttachmentRules[baseName]?.[markName];
      if (!rule && (characterSets || (groups && Object.keys(groups).length > 0))) {
          for (const baseKey in markAttachmentRules) {
              if (baseKey.startsWith('$') || baseKey.startsWith('@')) {
                  const safeGroups = groups || {};
                  const members = expandMembers([baseKey], safeGroups, characterSets);
                  if (members.includes(baseName)) {
                      const categoryRules = markAttachmentRules[baseKey];
                      rule = categoryRules?.[markName];
                      if (rule) break;
                      for (const markKey in categoryRules) {
                          if ((markKey.startsWith('$') || markKey.startsWith('@'))) {
                              const markMembers = expandMembers([markKey], safeGroups, characterSets);
                              if (markMembers.includes(markName)) { rule = categoryRules[markKey]; break; }
                          }
                      }
                      if (rule) break;
                  }
              }
          }
      }
      return rule;
    };

    const calculateDefaultMarkOffset = (baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, isAbsolute = false, groups = {}, movementConstraint = 'none') => {
        if (isAbsolute || !baseBbox || !markBbox) return { x: 0, y: 0 };
        let offset = { x: 0, y: 0 };
        let rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
        if (rule) {
            const [baseAttachName, markAttachName, xOffsetStr, yOffsetStr] = rule;
            let baseAttachPoint = getAttachmentPointCoords(baseBbox, baseAttachName);
            if (xOffsetStr !== undefined && yOffsetStr !== undefined) {
                baseAttachPoint = { x: baseAttachPoint.x + (parseFloat(xOffsetStr) || 0), y: baseAttachPoint.y + (parseFloat(yOffsetStr) || 0) };
            }
            const markAttachPoint = getAttachmentPointCoords(markBbox, markAttachName);
            offset = VEC.sub(baseAttachPoint, markAttachPoint);
        } else {
             const baseRsb = baseChar.rsb ?? metrics.defaultRSB;
             const markLsb = markChar.lsb ?? metrics.defaultLSB;
             offset = { x: (baseBbox.x + baseBbox.width + baseRsb + markLsb) - markBbox.x, y: 0 };
        }
        if (movementConstraint === 'horizontal') offset.y = 0;
        if (movementConstraint === 'vertical') offset.x = 0;
        return offset;
    };

    const getTransformForIndex = (config, index) => {
        if (!Array.isArray(config)) return { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' };
        const item = config[index];
        if (item === undefined || item === null) return { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' };
        if (typeof item === 'object' && !Array.isArray(item)) return { scale: item.scale ?? 1, rotation: item.rotation ?? 0, x: item.x ?? 0, y: item.y ?? 0, mode: item.mode ?? 'relative' };
        return { scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' };
    };

    const generateId = () => Date.now() + '-' + Math.random();

    const generateCompositeGlyphData = ({ character, allCharsByName, allGlyphData, settings, metrics, markAttachmentRules, allCharacterSets, groups = {} }) => {
        const componentNames = character.link || character.composite;
        if (!componentNames || componentNames.length === 0) return null;
        const componentChars = componentNames.map(name => allCharsByName.get(name)).filter(Boolean);
        if (componentChars.length !== componentNames.length || !componentChars.every(c => isGlyphDrawn(allGlyphData.get(c.unicode)))) return null;
        const transformComponentPaths = (paths, charDef, componentIndex) => {
            const { scale, rotation } = getTransformForIndex(charDef.compositeTransform, componentIndex);
            if (scale === 1.0 && rotation === 0) return paths;
            const bbox = getAccurateGlyphBBox(paths, settings.strokeThickness);
            if (!bbox) return paths;
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
            const angleRad = ((rotation || 0) * Math.PI) / 180;
            const transformPoint = p => VEC.add(VEC.rotate(VEC.scale(VEC.sub(p, { x: centerX, y: centerY }), scale), angleRad), { x: centerX, y: centerY });
            return paths.map(p => ({
                ...p, points: p.points.map(transformPoint),
                segmentGroups: p.segmentGroups ? p.segmentGroups.map(g => g.map(s => ({
                    ...s, point: transformPoint(s.point), handleIn: VEC.rotate(VEC.scale(s.handleIn, scale), angleRad), handleOut: VEC.rotate(VEC.scale(s.handleOut, scale), angleRad)
                }))) : undefined
            }));
        };
        const transformedComponents = componentChars.map((char, index) => {
            const glyph = allGlyphData.get(char.unicode);
            const rawPaths = deepClone(glyph.paths);
            const transformedPaths = transformComponentPaths(rawPaths, character, index);
            const bbox = getAccurateGlyphBBox(transformedPaths, settings.strokeThickness);
            const { x, y, mode } = getTransformForIndex(character.compositeTransform, index);
            return { char, paths: transformedPaths, bbox, manualTransform: { x: x || 0, y: y || 0, mode } };
        });
        if (transformedComponents.length === 0 || !transformedComponents[0]) return null;
        let baseComp = transformedComponents[0];
        let baseOffset = { x: baseComp.manualTransform.x, y: baseComp.manualTransform.y };
        let accumulatedPaths = baseComp.paths.map(p => ({ ...p, id: generateId(), groupId: 'component-0', points: p.points.map(pt => VEC.add(pt, baseOffset)), segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: VEC.add(seg.point, baseOffset) }))) : undefined }));
        for (let i = 1; i < transformedComponents.length; i++) {
            const baseComponent = transformedComponents[i - 1];
            const markComponent = transformedComponents[i];
            const markBbox = markComponent.bbox;
            if (!markBbox) continue;
            let autoOffset;
            const { mode, x, y } = markComponent.manualTransform;
            if (mode === 'touching') {
                const prevBbox = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
                autoOffset = prevBbox ? { x: prevBbox.x + prevBbox.width - markBbox.x, y: 0 } : { x: 0, y: 0 };
            } else if (mode === 'absolute') {
                autoOffset = { x: 0, y: 0 };
            } else {
                let baseBboxForOffset = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
                autoOffset = calculateDefaultMarkOffset(baseComponent.char, markComponent.char, baseBboxForOffset, markBbox, markAttachmentRules, metrics, allCharacterSets, false, groups);
            }
            const finalOffset = { x: autoOffset.x + x, y: autoOffset.y + y };
            const finalMarkPaths = markComponent.paths.map(p => ({ ...p, id: generateId(), groupId: 'component-' + i, points: p.points.map(pt => VEC.add(pt, finalOffset)), segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: VEC.add(seg.point, finalOffset) }))) : undefined }));
            accumulatedPaths.push(...finalMarkPaths);
        }
        if (accumulatedPaths.length === 0) return null;
        const finalBbox = getAccurateGlyphBBox(accumulatedPaths, settings.strokeThickness);
        if (finalBbox) {
            const shiftX = 500 - (finalBbox.x + finalBbox.width / 2);
            const centeredPaths = accumulatedPaths.map(p => ({ ...p, points: p.points.map(pt => ({ x: pt.x + shiftX, y: pt.y })), segmentGroups: p.segmentGroups ? p.segmentGroups.map(g => g.map(s => ({ ...s, point: { x: s.point.x + shiftX, y: s.point.y } }))) : undefined }));
            return { paths: centeredPaths };
        }
        return { paths: accumulatedPaths };
    };

    // --- WORKER MAIN LOGIC ---
    self.onmessage = (event) => {
        const { unicode, newGlyphData, dependencyMapData, glyphDataMapData, allCharsByUnicodeData, allCharsByNameData, settings, metrics, markAttachmentRules, characterSets, groups, silent } = event.data;
        try {
            const dependencyMap = new Map(dependencyMapData.map(([k, v]) => [k, new Set(v)]));
            const glyphDataMap = new Map(glyphDataMapData);
            const allCharsByUnicode = new Map(allCharsByUnicodeData);
            const allCharsByName = new Map(allCharsByNameData);
            
            const updates = new Map();
            const calculationSourceMap = new Map(glyphDataMap);
            calculationSourceMap.set(unicode, newGlyphData);

            const queue = [unicode];
            const visited = new Set([unicode]);

            while (queue.length > 0) {
                const currentSourceUnicode = queue.shift();
                const currentDependents = dependencyMap.get(currentSourceUnicode);
                if (!currentDependents) continue;

                for (const depUnicode of currentDependents) {
                    if (visited.has(depUnicode)) continue;
                    const dependentChar = allCharsByUnicode.get(depUnicode);
                    if (!dependentChar || (!dependentChar.link && !dependentChar.position && !dependentChar.kern)) continue;
        
                    const shouldBake = !!dependentChar.link || (!!dependentChar.position && !dependentChar.gpos);

                    const regenerated = generateCompositeGlyphData({ character: dependentChar, allCharsByName, allGlyphData: calculationSourceMap, settings, metrics, markAttachmentRules, allCharacterSets: characterSets, groups });
                    
                    if (regenerated) {
                        if (shouldBake) updates.set(depUnicode, regenerated);
                        calculationSourceMap.set(depUnicode, regenerated);
                        visited.add(depUnicode);
                        queue.push(depUnicode);
                    }
                }
            }
            self.postMessage({ type: 'complete', payload: { updates: Array.from(updates.entries()), silent } });
        } catch (error) {
            console.error('Error in cascade worker:', error);
            self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown worker error' });
        }
    };
`;

export const useGlyphActions = (
    dependencyMap: React.MutableRefObject<Map<number, Set<number>>>,
    projectId: number | undefined
) => {
    const { t } = useLocale();
    const layout = useLayout();
    const { characterSets, allCharsByUnicode, allCharsByName, dispatchCharacterAction: characterDispatch, markAttachmentRules, positioningRules, recommendedKerning } = useProject();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { settings, metrics, dispatch: settingsDispatch } = useSettings();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { kerningMap, suggestedKerningMap, dispatch: kerningDispatch, queueAutoKern } = useKerning();
    const { state: rulesState } = useRules();
    const groups = rulesState.fontRules?.groups || {};
    
    // --- Atomic PUA Cursor ---
    const puaCursorRef = useRef<number>(0xE000 - 1);

    useEffect(() => {
        let maxFound = 0xE000 - 1;
        allCharsByUnicode.forEach((char, unicode) => {
            if (unicode >= 0xE000 && unicode <= 0xF8FF) {
                maxFound = Math.max(maxFound, unicode);
            }
            else if (unicode >= 0xF0000 && unicode <= 0xFFFFD) {
                maxFound = Math.max(maxFound, unicode);
            }
        });
        if (maxFound > puaCursorRef.current) {
            puaCursorRef.current = maxFound;
        }
    }, [allCharsByUnicode]);

    const getNextAtomicPua = useCallback(() => {
        let next = puaCursorRef.current + 1;
        if (next > 0xF8FF && next < 0xF0000) {
            next = 0xF0000;
        }
        puaCursorRef.current = next;
        return next;
    }, []);

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // --- Worker Lifecycle Management ---
    useEffect(() => {
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        workerUrl = URL.createObjectURL(blob);
        cascadeWorker = new Worker(workerUrl);

        cascadeWorker.onmessage = (event) => {
            const { type, payload, error } = event.data;
            if (type === 'complete') {
                const { updates, silent } = payload;
                if (isMounted.current && updates.length > 0) {
                    glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: updates });
                }
                 if (isMounted.current && !silent) {
                    layout.showNotification(t('saveGlyphSuccess'));
                 }
            } else if (type === 'error') {
                console.error("Cascade worker failed:", error);
                if (isMounted.current) {
                    layout.showNotification(`Error updating dependents: ${error}`, 'error');
                }
            }
        };

        return () => {
            if (cascadeWorker) {
                cascadeWorker.terminate();
                cascadeWorker = null;
            }
            if(workerUrl) {
                URL.revokeObjectURL(workerUrl);
                workerUrl = null;
            }
        };
    }, [glyphDataDispatch, layout, t]);
    
    // --- Auto-Kern Trigger Logic ---
    const triggerAutoKernForChar = useCallback((unicode: number) => {
        // Optimization: Only run if background auto-kerning is explicitly enabled
        if (!settings?.isBackgroundAutoKerningEnabled) return;

        const keysToDelete: string[] = [];
        for (const [key] of suggestedKerningMap) {
             const [l, r] = key.split('-').map(Number);
             if (l === unicode || r === unicode) {
                 if (!kerningMap.has(key)) {
                     keysToDelete.push(key);
                 }
             }
        }

        if (keysToDelete.length > 0) {
            kerningDispatch({ type: 'REMOVE_SUGGESTIONS', payload: keysToDelete });
        }

        if (!recommendedKerning || recommendedKerning.length === 0 || !characterSets) return;
        
        const char = allCharsByUnicode.get(unicode);
        if (!char) return;
        
        const affectedPairs: QueuedPair[] = [];
        
        recommendedKerning.forEach(([leftRule, rightRule, val]) => {
            const lefts = expandMembers([leftRule], groups, characterSets);
            const rights = expandMembers([rightRule], groups, characterSets);
            
            const isLeft = lefts.includes(char.name);
            const isRight = rights.includes(char.name);
            
            if (!isLeft && !isRight) return;
            
            let targetDist: number | null = null;
            if (val !== undefined) {
                 if (typeof val === 'number') targetDist = val;
                 else if (!isNaN(Number(val))) targetDist = Number(val);
                 else if (val === 'lsb' || val === 'rsb') targetDist = null; 
            }

            if (isLeft) {
                rights.forEach(rName => {
                    const rChar = allCharsByName.get(rName);
                    if (rChar?.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(rChar.unicode))) {
                        affectedPairs.push({ left: char, right: rChar, targetDistance: targetDist });
                    }
                });
            }
            
            if (isRight) {
                 lefts.forEach(lName => {
                    const lChar = allCharsByName.get(lName);
                    if (lChar?.unicode !== undefined && isGlyphDrawn(glyphDataMap.get(lChar.unicode))) {
                        affectedPairs.push({ left: lChar, right: char, targetDistance: targetDist });
                    }
                });
            }
        });
        
        if (affectedPairs.length > 0) {
            queueAutoKern(affectedPairs);
        }

    }, [recommendedKerning, characterSets, allCharsByUnicode, allCharsByName, groups, glyphDataMap, queueAutoKern, suggestedKerningMap, kerningMap, kerningDispatch, settings?.isBackgroundAutoKerningEnabled]);

    const handleSaveGlyph = useCallback(async (
        unicode: number,
        newGlyphData: GlyphData,
        newMetadata: { 
            lsb?: number; 
            rsb?: number; 
            glyphClass?: Character['glyphClass']; 
            advWidth?: number | string;
            label?: string; 
            compositeTransform?: ComponentTransform[];
            link?: string[];
            composite?: string[];
            liga?: string[];
            position?: [string, string];
            kern?: [string, string];
            gpos?: string;
            gsub?: string;
        },
        onSuccess?: () => void,
        options: SaveOptions = {}
    ) => {
        const { isDraft = false, silent = false } = options;

        const charToSave = allCharsByUnicode.get(unicode);
        if (!charToSave) return;
    
        const oldPathsJSON = JSON.stringify(glyphDataMap.get(unicode)?.paths || []);
        const newPathsJSON = JSON.stringify(newGlyphData.paths);
        const hasPathChanges = oldPathsJSON !== newPathsJSON;
        
        const hasMetadataChanges = 
            newMetadata.lsb !== charToSave.lsb || 
            newMetadata.rsb !== charToSave.rsb ||
            newMetadata.glyphClass !== charToSave.glyphClass ||
            newMetadata.advWidth !== charToSave.advWidth ||
            newMetadata.label !== charToSave.label || 
            newMetadata.gpos !== charToSave.gpos ||
            newMetadata.gsub !== charToSave.gsub ||
            JSON.stringify(newMetadata.liga) !== JSON.stringify(charToSave.liga) ||
            JSON.stringify(newMetadata.compositeTransform) !== JSON.stringify(charToSave.compositeTransform) ||
            JSON.stringify(newMetadata.link) !== JSON.stringify(charToSave.link) ||
            JSON.stringify(newMetadata.composite) !== JSON.stringify(charToSave.composite) ||
            JSON.stringify(newMetadata.position) !== JSON.stringify(charToSave.position) ||
            JSON.stringify(newMetadata.kern) !== JSON.stringify(charToSave.kern);
    
        if (!hasPathChanges && !hasMetadataChanges) {
            if (onSuccess) onSuccess();
            return;
        }

        if (hasPathChanges) {
             glyphDataDispatch({ type: 'SET_GLYPH', payload: { unicode, data: newGlyphData } });
        }
        
        if (hasMetadataChanges) {
            characterDispatch({ type: 'UPDATE_CHARACTER_METADATA', payload: { unicode, ...newMetadata } });
        }

        if (hasPathChanges || (hasMetadataChanges && (newMetadata.lsb !== undefined || newMetadata.rsb !== undefined))) {
             triggerAutoKernForChar(unicode);
        }

        const rawDependents = dependencyMap.current.get(unicode);
        const linkedDependents = new Set<number>();
        if (rawDependents) {
            rawDependents.forEach(depUni => {
                const depChar = allCharsByUnicode.get(depUni);
                if (depChar && (depChar.link || depChar.position || depChar.kern)) {
                    linkedDependents.add(depUni);
                }
            });
        }
        
        let positionedPairCount = 0;
        markPositioningMap.forEach((_, key) => {
            const [baseUnicode, markUnicode] = key.split('-').map(Number);
            if (baseUnicode === unicode || markUnicode === unicode) {
                if (isGlyphDrawn(baseUnicode === unicode ? newGlyphData : glyphDataMap.get(baseUnicode)) && isGlyphDrawn(markUnicode === unicode ? newGlyphData : glyphDataMap.get(markUnicode))) {
                    positionedPairCount++;
                }
            }
        });

        const hasDependents = (linkedDependents.size > 0) || positionedPairCount > 0;

        if (hasDependents) {
            if (!silent) {
                 layout.showNotification(t('updatingDependents', { count: linkedDependents.size + positionedPairCount }), 'info', { duration: isDraft ? 2000 : 10000 });
            }

            if (cascadeWorker) {
                const dependencyMapData = Array.from(dependencyMap.current.entries()).map(([key, val]) => [key, Array.from(val)]);
                const dataForWorker = {
                    unicode, newGlyphData, dependencyMapData,
                    glyphDataMapData: Array.from(glyphDataMap.entries()),
                    allCharsByUnicodeData: Array.from(allCharsByUnicode.entries()),
                    allCharsByNameData: Array.from(allCharsByName.entries()),
                    settings, metrics, markAttachmentRules, characterSets, groups, silent: isDraft || silent
                };
                cascadeWorker.postMessage(dataForWorker);
            }

        } else {
             if (!silent && !isDraft) layout.showNotification(t('saveGlyphSuccess'));
        }
        
        if (onSuccess) onSuccess();

    }, [allCharsByUnicode, glyphDataMap, dependencyMap, markPositioningMap, characterSets, glyphDataDispatch, characterDispatch, positioningDispatch, layout, settings, metrics, markAttachmentRules, allCharsByName, t, groups, triggerAutoKernForChar]);

    const handleDeleteGlyph = useCallback((unicode: number) => {
        const charToDelete = allCharsByUnicode.get(unicode); if (!charToDelete) return;
        
        const glyphDataSnapshot = new Map(glyphDataMap);
        const characterSetsSnapshot = deepClone(characterSets);
        const kerningSnapshot = new Map(kerningMap);
        const positioningSnapshot = new Map(markPositioningMap);
        const dependencySnapshot = new Map(dependencyMap.current);
        
        const undo = () => {
            glyphDataDispatch({ type: 'SET_MAP', payload: glyphDataSnapshot });
            characterDispatch({ type: 'SET_CHARACTER_SETS', payload: characterSetsSnapshot });
            kerningDispatch({ type: 'SET_MAP', payload: kerningSnapshot });
            positioningDispatch({ type: 'SET_MAP', payload: positioningSnapshot });
            dependencyMap.current = dependencySnapshot;
        };

        const dependents = dependencyMap.current.get(unicode);
        if (dependents && dependents.size > 0) {
            const dependentUnicodes = Array.from(dependents);
            const batchUpdates: [number, GlyphData][] = [];
            
            dependentUnicodes.forEach((depUni: number) => {
                const depChar = allCharsByUnicode.get(depUni);
                if (depChar && (depChar.link || depChar.composite)) {
                    const compositeData = generateCompositeGlyphData({
                        character: depChar,
                        allCharsByName,
                        allGlyphData: glyphDataMap,
                        settings: settings!,
                        metrics: metrics!,
                        markAttachmentRules,
                        allCharacterSets: characterSets!,
                        groups
                    });
                    if (compositeData) batchUpdates.push([depUni, compositeData]);
                }
            });
            
            if (batchUpdates.length > 0) {
                glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: batchUpdates });
            }

            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets) => {
                if (!prevSets) return null;
                return prevSets.map(set => ({
                    ...set,
                    characters: set.characters.map(char => {
                        if (dependentUnicodes.includes(char.unicode!)) {
                            const newChar = { ...char };
                            delete newChar.link;
                            delete newChar.composite;
                            delete newChar.compositeTransform;
                            delete newChar.sourceLink;
                            return newChar;
                        }
                        return char;
                    })
                }));
            }});
            dependencyMap.current.delete(unicode);
        }

        const newKerningMap = new Map<string, number>();
        kerningMap.forEach((value, key) => {
            const [left, right] = key.split('-').map(Number);
            if (left !== unicode && right !== unicode) newKerningMap.set(key, value);
        });

        const newPositioningMap = new Map<string, Point>();
        markPositioningMap.forEach((value, key) => {
            const [base, mark] = key.split('-').map(Number);
            if (base !== unicode && mark !== unicode) newPositioningMap.set(key, value);
        });

        glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode }});
        characterDispatch({ type: 'DELETE_CHARACTER', payload: { unicode } });
        kerningDispatch({ type: 'SET_MAP', payload: newKerningMap });
        positioningDispatch({ type: 'SET_MAP', payload: newPositioningMap });
        
        layout.closeCharacterModal();
        layout.showNotification(t('glyphDeletedSuccess', { name: charToDelete.name }), 'success', { onUndo: undo });
    }, [allCharsByUnicode, t, glyphDataDispatch, characterDispatch, kerningDispatch, positioningDispatch, layout, glyphDataMap, characterSets, kerningMap, markPositioningMap, dependencyMap, allCharsByName, settings, metrics, markAttachmentRules, groups]);

    const handleAddGlyph = useCallback((charData: { unicode?: number; name: string }, targetSetName?: string) => {
        let finalUnicode = charData.unicode;
        let isPuaAssigned = false;
        
        if (finalUnicode === undefined) {
             const lowerName = charData.name.trim().toLowerCase();
             if (STANDARD_NAMES[lowerName]) {
                 finalUnicode = STANDARD_NAMES[lowerName];
                 if (allCharsByUnicode.has(finalUnicode)) finalUnicode = undefined;
             }
        }
    
        if (finalUnicode === undefined) {
            finalUnicode = getNextAtomicPua();
            isPuaAssigned = true;
        }
    
        const category = UnicodeProperties.getCategory(finalUnicode);
        const glyphClass = (category === 'Mn' || category === 'Mc' || category === 'Me') ? 'mark' : 'base';
    
        const newChar: Character = {
            ...charData,
            unicode: finalUnicode,
            isCustom: true,
            isPuaAssigned: isPuaAssigned,
            glyphClass,
        };
    
        if (category === 'Mn') newChar.advWidth = 0;

        characterDispatch({ type: 'ADD_CHARACTERS', payload: { characters: [newChar], activeTabNameKey: targetSetName || '' } });
        layout.closeModal();
        layout.showNotification(t('glyphAddedSuccess', { name: newChar.name }));
        layout.selectCharacter(newChar);
    }, [characterDispatch, layout, t, allCharsByUnicode, getNextAtomicPua]);
    
    const handleQuickAddGlyph = useCallback((input: string, targetSetName: string = 'Custom_Glyphs') => {
        const trimmedInput = input.trim();
        if (!trimmedInput) return;

        if (allCharsByName.has(trimmedInput)) {
            layout.showNotification(t('errorNameExists'), 'error');
            return;
        }

        let unicode: number | undefined;
        let name: string = trimmedInput;
        const hexMatch = trimmedInput.match(/^(?:U\+)?([0-9a-fA-F]{1,6})$/);
        
        if (hexMatch) {
            const potentialUnicode = parseInt(hexMatch[1], 16);
            if (!isNaN(potentialUnicode) && potentialUnicode <= 0x10FFFF) {
                if (allCharsByUnicode.has(potentialUnicode)) {
                    const existing = allCharsByUnicode.get(potentialUnicode);
                    layout.showNotification(t('errorGlyphExists', { codepoint: potentialUnicode.toString(16).toUpperCase().padStart(4, '0'), name: existing?.name || '' }), 'error');
                    return;
                }
                unicode = potentialUnicode;
                if (trimmedInput.toUpperCase() === hexMatch[1] || trimmedInput.toUpperCase() === `U+${hexMatch[1]}`) {
                    name = String.fromCodePoint(unicode);
                     if (allCharsByName.has(name)) {
                        layout.showNotification(t('errorNameExists'), 'error');
                        return;
                    }
                }
            }
        }
        
        if (unicode === undefined) {
             if ([...trimmedInput].length === 1) {
                unicode = trimmedInput.codePointAt(0);
                if (unicode && allCharsByUnicode.has(unicode)) {
                    layout.showNotification(t('errorUnicodeFromCharExists', { char: trimmedInput, codepoint: unicode.toString(16).toUpperCase() }), 'error');
                    return;
                }
             } else { unicode = undefined; }
        }
        
        handleAddGlyph({ unicode, name }, targetSetName);
    }, [allCharsByName, allCharsByUnicode, handleAddGlyph, layout, t]);

    const handleUnlockGlyph = useCallback((unicode: number) => {
        const charToUnlock = allCharsByUnicode.get(unicode);
        if (!charToUnlock) return;
        
        let sourceType: 'position' | 'link' | 'kern' | undefined;
        let components: string[] | undefined;
        let transforms: ComponentTransform[] | undefined;
        
        if (charToUnlock.position) {
            sourceType = 'position';
            components = charToUnlock.position;
            if (settings && metrics && glyphDataMap && components.length === 2) {
                const baseName = components[0];
                const markName = components[1];
                const baseChar = allCharsByName.get(baseName);
                const markChar = allCharsByName.get(markName);
                if (baseChar?.unicode !== undefined && markChar?.unicode !== undefined) {
                    const baseGlyph = glyphDataMap.get(baseChar.unicode);
                    const markGlyph = glyphDataMap.get(markChar.unicode);
                    if (isGlyphDrawn(baseGlyph) && isGlyphDrawn(markGlyph)) {
                        const pairKey = `${baseChar.unicode}-${markChar.unicode}`;
                        let offset = markPositioningMap.get(pairKey);
                        if (!offset) {
                             const baseBbox = getAccurateGlyphBBox(baseGlyph!.paths, settings.strokeThickness);
                             const markBbox = getAccurateGlyphBBox(markGlyph!.paths, settings.strokeThickness);
                             let constraint: 'horizontal' | 'vertical' | 'none' = 'none';
                             const rule = positioningRules?.find(r => expandMembers(r.base, groups, characterSets).includes(baseChar.name) && expandMembers(r.mark || [], groups, characterSets).includes(markChar.name));
                             if (rule?.movement === 'horizontal' || rule?.movement === 'vertical') constraint = rule.movement;
                             offset = calculateDefaultMarkOffset(baseChar, markChar, baseBbox, markBbox, markAttachmentRules, metrics, characterSets, false, groups, constraint);
                        }
                        if (offset) transforms = [{ scale: 1, x: 0, y: 0, mode: 'relative' }, { scale: 1, x: offset.x, y: offset.y, mode: 'absolute' }];
                    }
                }
            }
        } else if (charToUnlock.kern) {
            sourceType = 'kern';
            components = charToUnlock.kern;
            if (settings && metrics && glyphDataMap) {
                const leftName = components[0];
                const rightName = components[1];
                const leftChar = allCharsByName.get(leftName);
                const rightChar = allCharsByName.get(rightName);
                if (leftChar?.unicode !== undefined && rightChar?.unicode !== undefined) {
                    const leftGlyph = glyphDataMap.get(leftChar.unicode);
                    const rightGlyph = glyphDataMap.get(rightChar.unicode);
                    if (isGlyphDrawn(leftGlyph) && isGlyphDrawn(rightGlyph)) {
                        const lBox = getAccurateGlyphBBox(leftGlyph!.paths, settings.strokeThickness);
                        const rBox = getAccurateGlyphBBox(rightGlyph!.paths, settings.strokeThickness);
                        if (lBox && rBox) {
                            const pairKey = `${leftChar.unicode}-${rightChar.unicode}`;
                            const kernVal = kerningMap.get(pairKey) || 0;
                            const rsbL = leftChar.rsb ?? metrics.defaultRSB;
                            const lsbR = rightChar.lsb ?? metrics.defaultLSB;
                            const shiftX = (lBox.x + lBox.width) + rsbL + kernVal + lsbR - rBox.x;
                            transforms = [{ scale: 1, x: 0, y: 0, mode: 'relative' }, { scale: 1, x: shiftX, y: 0, mode: 'absolute' }];
                        }
                    }
                }
            }
        } else if (charToUnlock.link) {
            sourceType = 'link';
            components = charToUnlock.link;
        }

        if (!components) return;
        const unlockedChar = { ...charToUnlock };
        unlockedChar.composite = components;
        if (transforms) unlockedChar.compositeTransform = transforms;
        unlockedChar.sourceLink = components;
        if (sourceType) unlockedChar.sourceLinkType = sourceType;
        delete unlockedChar.link; delete unlockedChar.position; delete unlockedChar.kern;
        if (layout.selectedCharacter?.unicode === unicode) layout.selectCharacter(unlockedChar);
        characterDispatch({ type: 'UNLINK_GLYPH', payload: { unicode, transforms } });
        dependencyMap.current.forEach((dependents, key) => { if (dependents.has(unicode)) dependents.delete(unicode); });
    }, [characterDispatch, allCharsByUnicode, dependencyMap, layout, allCharsByName, glyphDataMap, kerningMap, settings, metrics, markPositioningMap, markAttachmentRules, characterSets, groups, positioningRules]);

    const handleRelinkGlyph = useCallback((unicode: number) => {
        const charToRelink = allCharsByUnicode.get(unicode);
        if (!charToRelink || !charToRelink.sourceLink) return;

        const relinkedChar = { ...charToRelink };
        const targetType = relinkedChar.sourceLinkType || 'link';
        
        if (targetType === 'position') {
            relinkedChar.position = relinkedChar.sourceLink as [string, string];
            if (relinkedChar.compositeTransform && relinkedChar.compositeTransform.length > 1) {
                const baseT = relinkedChar.compositeTransform[0];
                const markT = relinkedChar.compositeTransform[1];
                const x = (markT.x || 0) - (baseT.x || 0);
                const y = (markT.y || 0) - (baseT.y || 0);
                const key = `${allCharsByName.get(relinkedChar.sourceLink[0])?.unicode}-${allCharsByName.get(relinkedChar.sourceLink[1])?.unicode}`;
                positioningDispatch({ type: 'SET_MAP', payload: new Map(markPositioningMap).set(key, { x, y }) });
            }
        } else if (targetType === 'kern') {
             relinkedChar.kern = relinkedChar.sourceLink as [string, string];
             if (relinkedChar.compositeTransform && relinkedChar.compositeTransform.length > 1 && settings && metrics) {
                 const leftChar = allCharsByName.get(relinkedChar.sourceLink[0]);
                 const rightChar = allCharsByName.get(relinkedChar.sourceLink[1]);
                 if (leftChar?.unicode !== undefined && rightChar?.unicode !== undefined) {
                     const leftGlyph = glyphDataMap.get(leftChar.unicode);
                     const rightGlyph = glyphDataMap.get(rightChar.unicode);
                     if (isGlyphDrawn(leftGlyph) && isGlyphDrawn(rightGlyph)) {
                        const lBox = getAccurateGlyphBBox(leftGlyph!.paths, settings.strokeThickness);
                        const rBox = getAccurateGlyphBBox(rightGlyph!.paths, settings.strokeThickness);
                        if (lBox && rBox) {
                            const baseT = relinkedChar.compositeTransform[0];
                            const markT = relinkedChar.compositeTransform[1];
                            const currentShiftX = (markT.x || 0) - (baseT.x || 0);
                            const rsbL = leftChar.rsb ?? metrics.defaultRSB;
                            const lsbR = rightChar.lsb ?? metrics.defaultLSB;
                            const calculatedKern = Math.round(currentShiftX - (lBox.x + lBox.width) - rsbL - lsbR + rBox.x);
                            const key = `${leftChar.unicode}-${rightChar.unicode}`;
                            kerningDispatch({ type: 'SET_MAP', payload: new Map(kerningMap).set(key, calculatedKern) });
                        }
                     }
                 }
             }
        } else {
            relinkedChar.link = relinkedChar.sourceLink;
        }

        if (relinkedChar.sourceGlyphClass) {
             relinkedChar.glyphClass = relinkedChar.sourceGlyphClass;
             delete relinkedChar.sourceGlyphClass;
        }

        delete relinkedChar.sourceLink; delete relinkedChar.sourceLinkType; delete relinkedChar.composite; delete relinkedChar.compositeTransform;
        if (layout.selectedCharacter?.unicode === unicode) layout.selectCharacter(relinkedChar);
        characterDispatch({ type: 'RELINK_GLYPH', payload: { unicode } });
        
        if (settings && metrics && characterSets) {
            if (targetType === 'position' || targetType === 'kern') glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
            else {
                const compositeData = generateCompositeGlyphData({ character: relinkedChar, allCharsByName, allGlyphData: glyphDataMap, settings, metrics, markAttachmentRules, allCharacterSets: characterSets, groups });
                if (compositeData) glyphDataDispatch({ type: 'SET_GLYPH', payload: { unicode, data: compositeData } });
                else glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } });
            }
        } else { glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode } }); }

        const targetList = relinkedChar.link || relinkedChar.position || relinkedChar.kern;
        if (targetList) {
            targetList.forEach(compName => {
                const componentChar = allCharsByName.get(compName);
                if (componentChar?.unicode !== undefined) {
                    if (!dependencyMap.current.has(componentChar.unicode)) dependencyMap.current.set(componentChar.unicode, new Set());
                    dependencyMap.current.get(componentChar.unicode)!.add(unicode);
                }
            });
        }
    }, [characterDispatch, glyphDataDispatch, positioningDispatch, kerningDispatch, allCharsByUnicode, allCharsByName, dependencyMap, layout, settings, metrics, markAttachmentRules, characterSets, glyphDataMap, groups, markPositioningMap, kerningMap]);
    
    const handleUpdateDependencies = useCallback((unicode: number, newLinkComponents: string[] | null) => {
        const currentChar = allCharsByUnicode.get(unicode);
        const oldComponents = currentChar?.link || currentChar?.composite || currentChar?.position || currentChar?.kern;
        if (oldComponents) {
            oldComponents.forEach(compName => {
                const compChar = allCharsByName.get(compName);
                if (compChar && compChar.unicode !== undefined) {
                    const dependents = dependencyMap.current.get(compChar.unicode);
                    if (dependents) dependents.delete(unicode);
                }
            });
        }
        if (newLinkComponents && newLinkComponents.length > 0) {
            newLinkComponents.forEach(compName => {
                const compChar = allCharsByName.get(compName);
                if (compChar && compChar.unicode !== undefined) {
                    if (!dependencyMap.current.has(compChar.unicode)) dependencyMap.current.set(compChar.unicode, new Set());
                    dependencyMap.current.get(compChar.unicode)!.add(unicode);
                }
            });
        }
    }, [allCharsByUnicode, allCharsByName, dependencyMap]);

    const handleImportGlyphs = useCallback((glyphsToImport: [number, GlyphData][]) => {
        if (!glyphsToImport || glyphsToImport.length === 0) return;
        glyphDataDispatch({ type: 'BATCH_UPDATE_GLYPHS', payload: glyphsToImport });
        if (projectId !== undefined) dbService.deleteFontCache(projectId);
        layout.showNotification(t('glyphsImportedSuccess', { count: glyphsToImport.length }));
        layout.closeModal();
    }, [glyphDataDispatch, layout, t, projectId]);

    const handleAddBlock = useCallback((charsToAdd: Character[]) => {
        if (!characterSets) return;
        const visibleCharacterSets = characterSets.map(set => ({ ...set, characters: set.characters.filter(char => char.unicode !== 8205 && char.unicode !== 8204) })).filter(set => set.nameKey !== 'dynamicLigatures' && set.characters.length > 0);
        const activeTabNameKey = (layout.activeTab < visibleCharacterSets.length) ? visibleCharacterSets[layout.activeTab].nameKey : 'punctuationsAndOthers';
        characterDispatch({ type: 'ADD_CHARACTERS', payload: { characters: charsToAdd, activeTabNameKey } });
        if (charsToAdd.length > 0) layout.showNotification(t('glyphsAddedFromBlock', { count: charsToAdd.length }), 'success');
        else layout.showNotification(t('allGlyphsFromBlockExist'), 'info');
    }, [characterSets, characterDispatch, layout, t]);

    const handleCheckGlyphExists = useCallback((unicode: number): boolean => allCharsByUnicode.has(unicode), [allCharsByUnicode]);
    const handleCheckNameExists = useCallback((name: string): boolean => allCharsByName.has(name), [allCharsByName]);

    return {
        handleSaveGlyph,
        handleDeleteGlyph,
        handleAddGlyph,
        handleQuickAddGlyph,
        handleUnlockGlyph,
        handleRelinkGlyph,
        handleUpdateDependencies,
        handleImportGlyphs,
        handleAddBlock,
        handleCheckGlyphExists,
        handleCheckNameExists,
    };
};
