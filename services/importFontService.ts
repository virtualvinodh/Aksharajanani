
import { ProjectData, GlyphData, Path, Segment, Point, AppSettings, FontMetrics, CharacterSet, ScriptDefaults } from '../types';
import { getGlyphExportNameByUnicode } from '../utils/glyphUtils';

const generateId = () => `${Date.now()}-${Math.random()}`;

export const parseFontFile = async (file: File): Promise<any> => {
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
        try {
            const font = window.opentype.parse(buffer);
            resolve(font);
        } catch (e) {
            reject(e);
        }
    });
};

export const mergeFontIntoProject = (
    currentProject: ProjectData,
    importedProject: ProjectData
): { newGlyphs: GlyphData[], newCharacters: any[] } => {
    const currentGlyphUnicodes = new Set(currentProject.glyphs.map(g => g.unicode));
    const newGlyphs = importedProject.glyphs.filter(g => !currentGlyphUnicodes.has(g.unicode));
    
    const currentCharacterUnicodes = new Set(
        currentProject.characterSets.flatMap(set => set.characters.map(c => c.unicode))
    );
    
    const newCharacters = importedProject.characterSets
        .flatMap(set => set.characters)
        .filter(c => c.unicode !== undefined && !currentCharacterUnicodes.has(c.unicode));
        
    return { newGlyphs, newCharacters };
};

export const extractProjectData = async (
    font: any, 
    fileName: string,
    onProgress: (progress: number, status: string) => void,
    manualFeaCode?: string
): Promise<ProjectData> => {
    
    const scale = 1000 / font.unitsPerEm;
    const baseLineY = 600; // Standard baseline for 1000 UPM

    const metrics: FontMetrics = {
        unitsPerEm: 1000,
        ascender: Math.round(font.ascender * scale),
        descender: Math.round(font.descender * scale),
        defaultAdvanceWidth: 800,
        topLineY: baseLineY - Math.round(font.ascender * scale * 0.6), // Approximate cap height
        baseLineY: baseLineY,
        styleName: 'Regular',
        spaceAdvanceWidth: 400,
        defaultLSB: 50,
        defaultRSB: 50
    };

    const glyphs: [number, GlyphData][] = [];
    const characters: any[] = []; // We'll build a default character set

    const numGlyphs = font.glyphs.length;
    
    // Create a default character set
    const characterSet: CharacterSet = {
        nameKey: 'Imported',
        characters: []
    };

    // Pre-scan for used unicodes to avoid collisions when assigning PUA
    const usedUnicodes = new Set<number>();
    for (let i = 0; i < numGlyphs; i++) {
        const glyph = font.glyphs.get(i);
        if (glyph.unicode) {
            usedUnicodes.add(glyph.unicode);
        }
    }

    let puaCounter = 0xE000; // Start of Private Use Area

    for (let i = 0; i < numGlyphs; i++) {
        const glyph = font.glyphs.get(i);
        let unicode = glyph.unicode;
        let isPuaAssigned = false;
        
        if (i % 50 === 0) {
            onProgress((i / numGlyphs) * 100, `Importing glyph ${i + 1}/${numGlyphs}`);
            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // If no unicode, assign a PUA code
        if (!unicode) {
            while (usedUnicodes.has(puaCounter)) {
                puaCounter++;
            }
            unicode = puaCounter;
            usedUnicodes.add(unicode);
            isPuaAssigned = true;
        }

        const pathData = glyph.getPath(0, 0, font.unitsPerEm);
        const commands = pathData.commands;
        
        const segmentGroups: Segment[][] = [];
        let currentGroup: Segment[] = [];
        let startPoint: Point = { x: 0, y: 0 };
        let currentPoint: Point = { x: 0, y: 0 };

        // Helper to transform coordinates
        const tr = (x: number, y: number): Point => ({
            x: Math.round(x * scale),
            // Flip Y axis: opentype.js uses Y-up, but sometimes we need to invert or preserve based on context.
            // User reported shapes are upside down with (baseLineY - y).
            // This implies we need to flip the rendering.
            // Let's try inverting the direction.
            y: Math.round(baseLineY - (y * scale * -1)) 
        });

        // We need to track the previous handleOut to assign to the next segment's handleIn logic
        // But in our Segment model:
        // Segment N: point, handleIn (from N-1), handleOut (to N+1)
        // When we process command N, we are creating Segment N (at the END of the curve).
        // So command N defines: Segment N's point, Segment N's handleIn, and Segment N-1's handleOut.
        
        // Let's iterate and build segments.
        // M: Start new group.
        // L: Line.
        // C: Cubic.
        // Q: Quadratic.
        // Z: Close.

        // Since 'commands' is a flat list, we need to manage state.
        
        for (let j = 0; j < commands.length; j++) {
            const cmd = commands[j];
            
            if (cmd.type === 'M') {
                if (currentGroup.length > 0) {
                    segmentGroups.push(currentGroup);
                    currentGroup = [];
                }
                const p = tr(cmd.x, cmd.y);
                startPoint = p;
                currentPoint = p;
                // We don't add a segment for M yet, because a Segment represents a point *after* a curve/line.
                // But wait, our Segment model is a list of points that form the shape.
                // M defines the first point.
                currentGroup.push({
                    point: p,
                    handleIn: { x: 0, y: 0 },
                    handleOut: { x: 0, y: 0 }
                });
            } else if (cmd.type === 'L') {
                const p = tr(cmd.x, cmd.y);
                // Line: previous handleOut is 0, current handleIn is 0.
                currentGroup.push({
                    point: p,
                    handleIn: { x: 0, y: 0 },
                    handleOut: { x: 0, y: 0 }
                });
                currentPoint = p;
            } else if (cmd.type === 'C') {
                const p = tr(cmd.x, cmd.y);
                const c1 = tr(cmd.x1, cmd.y1);
                const c2 = tr(cmd.x2, cmd.y2);
                
                // Previous point's handleOut
                const prevIndex = currentGroup.length - 1;
                if (prevIndex >= 0) {
                    // handleOut is relative to prev point
                    // c1 is absolute. prevPoint is absolute.
                    // But wait, Y is flipped in tr().
                    // handleOut = c1 - prevPoint
                    currentGroup[prevIndex].handleOut = {
                        x: c1.x - currentGroup[prevIndex].point.x,
                        y: c1.y - currentGroup[prevIndex].point.y
                    };
                }

                // Current point's handleIn
                // handleIn = c2 - p
                const handleIn = {
                    x: c2.x - p.x,
                    y: c2.y - p.y
                };

                currentGroup.push({
                    point: p,
                    handleIn: handleIn,
                    handleOut: { x: 0, y: 0 } // Will be set by next command if it's a curve
                });
                currentPoint = p;
            } else if (cmd.type === 'Q') {
                const p = tr(cmd.x, cmd.y);
                const c1 = tr(cmd.x1, cmd.y1); // Quadratic control point
                
                // Convert to cubic
                // CP1 = current + 2/3 * (c1 - current)
                // CP2 = p + 2/3 * (c1 - p)
                
                const prev = currentGroup[currentGroup.length - 1].point;
                
                const cp1 = {
                    x: prev.x + (2.0 / 3.0) * (c1.x - prev.x),
                    y: prev.y + (2.0 / 3.0) * (c1.y - prev.y)
                };
                
                const cp2 = {
                    x: p.x + (2.0 / 3.0) * (c1.x - p.x),
                    y: p.y + (2.0 / 3.0) * (c1.y - p.y)
                };

                // Update prev handleOut
                const prevIndex = currentGroup.length - 1;
                if (prevIndex >= 0) {
                    currentGroup[prevIndex].handleOut = {
                        x: cp1.x - prev.x,
                        y: cp1.y - prev.y
                    };
                }

                // Current handleIn
                const handleIn = {
                    x: cp2.x - p.x,
                    y: cp2.y - p.y
                };

                currentGroup.push({
                    point: p,
                    handleIn: handleIn,
                    handleOut: { x: 0, y: 0 }
                });
                currentPoint = p;
            } else if (cmd.type === 'Z') {
                // Close path.
                // If last point != start point, add a line segment?
                // Or just let the renderer close it.
                // Our renderer uses `closePath()`.
                // But we need to ensure the handles connect if the last segment was a curve?
                // If Z is used, usually it connects back to start.
                // If the connection is a curve, it would be C ... then Z?
                // No, Z is a straight line closure usually.
                // If we want a smooth closure, we'd use C to start point.
                
                // Check if last point is same as start point
                const last = currentGroup[currentGroup.length - 1];
                const first = currentGroup[0];
                
                if (Math.abs(last.point.x - first.point.x) < 1 && Math.abs(last.point.y - first.point.y) < 1) {
                    // They are the same.
                    // If the last command was a curve, 'first' needs a handleIn?
                    // 'last' has a handleIn.
                    // We merge last into first?
                    // Copy last.handleIn to first.handleIn
                    first.handleIn = last.handleIn;
                    // Remove last
                    currentGroup.pop();
                }
                
                // If they are different, Z implies a straight line to start.
                // We don't need to add a segment, `closePath` does the line.
                // But we need to make sure `first.handleIn` is 0,0 if it's a line coming in.
                // It is initialized to 0,0.
            }
        }
        
        if (currentGroup.length > 0) {
            segmentGroups.push(currentGroup);
        }

        // Determine Glyph Class using GDEF table if available, otherwise infer
        let glyphClass: 'base' | 'ligature' | 'mark' | 'component' = 'base';
        
        // Try to read GDEF table
        if (font.tables && font.tables.gdef && font.tables.gdef.glyphClassDef) {
             try {
                 // opentype.js GDEF table structure might vary, but usually exposes a get() method on glyphClassDef
                 // or a 'classDef' object. The user provided snippet suggests .get(index).
                 // We need the glyph index.
                 const glyphIndex = glyph.index;
                 if (typeof glyphIndex === 'number') {
                     const classId = font.tables.gdef.glyphClassDef.get(glyphIndex);
                     switch (classId) {
                         case 1: glyphClass = 'base'; break;
                         case 2: glyphClass = 'ligature'; break;
                         case 3: glyphClass = 'mark'; break;
                         case 4: glyphClass = 'base'; break;
                     }
                 }
             } catch (e) {
                 console.warn('Failed to read GDEF table for glyph class, falling back to inference.', e);
             }
        } else {
            // Fallback Inference
            if (glyph.unicode && glyph.advanceWidth === 0) {
                glyphClass = 'mark';
            } else if (glyph.name && (glyph.name.includes('_') || glyph.name.includes('.liga'))) {
                glyphClass = 'ligature';
            }
        }

        // ALWAYS import the glyph, even if empty (segmentGroups.length === 0)
        // This preserves Space, NBSP, ZWJ, etc.
        const path: Path = {
            id: generateId(),
            type: 'outline',
            points: [], // Not used for outline type
            segmentGroups: segmentGroups
        };
        
        glyphs.push([unicode, { paths: [path] }]);
        
        characterSet.characters.push({
            unicode: unicode,
            name: glyph.name || getGlyphExportNameByUnicode(unicode),
            glyphClass: glyphClass,
            advWidth: Math.round(glyph.advanceWidth * scale),
            lsb: Math.round((glyph.leftSideBearing || 0) * scale),
            rsb: 0, // Calculated from advWidth usually
            isPuaAssigned: isPuaAssigned
        });
    }

    const settings: AppSettings = {
        fontName: font.names.fontFamily?.en || fileName.replace(/\.[^/.]+$/, ""),
        strokeThickness: 1, // Outline font
        contrast: 1,
        pathSimplification: 0,
        showGridOutlines: true,
        isAutosaveEnabled: true,
        editorMode: 'advanced',
        isPrefillEnabled: false,
        showHiddenGlyphs: false,
        showUnicodeValues: true
    };

    let transformedFeaCode = manualFeaCode;
    if (transformedFeaCode) {
        // Replace <NULL> with 0 before glyph name replacement
        transformedFeaCode = transformedFeaCode.replace(/<NULL>/g, '0');

        const glyphMap: Record<string, string> = {};
        characterSet.characters.forEach(char => {
            if (char.name && char.unicode !== undefined) {
                glyphMap[char.name] = getGlyphExportNameByUnicode(char.unicode);
            }
        });

        const sortedNames = Object.keys(glyphMap).sort((a, b) => b.length - a.length);

        sortedNames.forEach(originalName => {
            // Escape special regex characters in the glyph name (like periods)
            const escapedName = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Regex: Match the name ONLY if it's not surrounded by other valid glyph characters
            const regex = new RegExp(`(?<![A-Za-z0-9_.-])${escapedName}(?![A-Za-z0-9_.-])`, 'g');
            
            transformedFeaCode = transformedFeaCode!.replace(regex, glyphMap[originalName]);
        });
    }

    return {
        projectId: Date.now(),
        name: settings.fontName,
        scriptId: `project_${Date.now()}`,
        settings: settings,
        metrics: metrics,
        glyphs: glyphs,
        characterSets: [characterSet],
        savedAt: new Date().toISOString(),
        manualFeaCode: transformedFeaCode
    };
};
