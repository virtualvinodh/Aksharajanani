// Cascade worker: re-bakes linked/composite glyphs that depend on a saved glyph.
//
// A bundled module worker, started with new Worker(new URL(..., import.meta.url), { type: "module" }).
// It used to be a string turned into a blob URL that loaded paper.js 0.12.17 from cdnjs at runtime;
// it now imports the paper.js version bundled with the app. The code below is otherwise unchanged.
import paper from "paper";

    // Load paper.js library inside the worker

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
        // Numbers may be written as text ("-20"); read them as numbers (see getTransformForIndex in
        // services/glyphRenderService.ts: "0" + "-20" made "0-20" and the rebuilt glyph NaN).
        const num = (v, fallback) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? fallback : n; };
        if (typeof item === 'object' && !Array.isArray(item)) return { scale: num(item.scale, 1), rotation: num(item.rotation, 0), x: num(item.x, 0), y: num(item.y, 0), mode: item.mode ?? 'relative' };
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
