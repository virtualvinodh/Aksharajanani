import {
    Character,
    GlyphData,
    Point,
    MarkAttachmentRules,
    CharacterSet,
    FontMetrics,
    BoundingBox,
    // FIX: Import the AttachmentPoint type to resolve TypeScript errors.
    AttachmentPoint
} from '../types';
import { VEC } from '../utils/vectorUtils';
import { getAccurateGlyphBBox } from './glyphRenderService';
import { expandMembers } from './groupExpansionService';

declare var UnicodeProperties: any;

let indicPosCategoryData: any | null = null;

/**
 * Initializes the positioning heuristics service by fetching required Unicode data.
 * Should be called once on application startup.
 */
export const initPositioningHeuristics = async () => {
    if (indicPosCategoryData) return;
    try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/iLib-js/UCD@main/json/IndicPositionalCategory.json');
        if (response.ok) {
            indicPosCategoryData = await response.json();
        } else {
            console.error("Failed to load IndicPositionalCategory.json");
        }
    } catch (e) {
        console.error("Error fetching IndicPositionalCategory.json", e);
    }
};

const getIndicPosCategory = (codepoint: number): string | null => {
    if (!indicPosCategoryData) return null;
    for (const rangeKey in indicPosCategoryData) {
        if (rangeKey.includes('..')) {
            const [start, end] = rangeKey.split('..').map(s => parseInt(s, 16));
            if (codepoint >= start && codepoint <= end) {
                return indicPosCategoryData[rangeKey];
            }
        } else {
            const cp = parseInt(rangeKey, 16);
            if (codepoint === cp) {
                return indicPosCategoryData[rangeKey];
            }
        }
    }
    return 'NA'; // Explicitly return Not Applicable
};

export const getAttachmentPointCoords = (bbox: BoundingBox, pointName: AttachmentPoint): Point => {
    const { x, y, width, height } = bbox;
    switch (pointName) {
        case 'topLeft': return { x, y };
        case 'topCenter': return { x: x + width / 2, y };
        case 'topRight': return { x: x + width, y };
        case 'midLeft': return { x, y: y + height / 2 };
        case 'midRight': return { x: x + width, y: y + height / 2 };
        case 'bottomLeft': return { x, y: y + height };
        case 'bottomCenter': return { x: x + width / 2, y: y + height };
        case 'bottomRight': return { x: x + width, y: y + height };
        default: return { x, y }; // Fallback
    }
};

export const resolveAttachmentRule = (
    baseName: string,
    markName: string,
    markAttachmentRules: MarkAttachmentRules | null,
    characterSets?: CharacterSet[],
    groups?: Record<string, string[]>
): any | null => {
    if (!markAttachmentRules) return null;

    // 1. Exact Match: Base Name -> Mark Name
    let rule = markAttachmentRules[baseName]?.[markName];

    // 2. Group/Class Match: Look for group keys like $consonants or @BaseClass
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
                            if (markMembers.includes(markName)) {
                                rule = categoryRules[markKey];
                                break;
                            }
                        }
                    }
                    if (rule) break;
                }
            }
        }
    }
    
    return rule;
};

export const calculateDefaultMarkOffset = (
    baseChar: Character,
    markChar: Character,
    baseBbox: BoundingBox | null,
    markBbox: BoundingBox | null,
    markAttachmentRules: MarkAttachmentRules | null,
    metrics: FontMetrics,
    characterSets?: CharacterSet[],
    isAbsolute: boolean = false,
    groups: Record<string, string[]> = {},
    movementConstraint: 'horizontal' | 'vertical' | 'none' = 'none'
): Point => {
    if (isAbsolute) {
        return { x: 0, y: 0 };
    }
    
    let offset = { x: 0, y: 0 };
    let rule: any | null = null;
    
    if (baseBbox && markBbox) {
        // --- TIER 1: INDIC POSITIONAL CATEGORY ---
        if (markChar.unicode) {
            const indicCategory = getIndicPosCategory(markChar.unicode);
            if (indicCategory && indicCategory !== 'NA') {
                 switch (indicCategory) {
                    case 'Top': rule = ["topCenter", "bottomCenter", "0", "-50"]; break;
                    case 'Bottom': rule = ["bottomCenter", "topCenter", "0", "50"]; break;
                    case 'Left': rule = ["midLeft", "midRight", "-50", "0"]; break;
                    case 'Right': rule = ["midRight", "midLeft", "50", "0"]; break;
                 }
            }
        }
        
        // --- TIER 2: CCC (Canonical Combining Class) ---
        if (!rule && markChar.unicode) {
            const ccc = UnicodeProperties.getCombiningClass(markChar.unicode);
            
            // Group 1 & 3 (Attached / Overlay) - Offset (0, 0)
            if (ccc === 1) { rule = ["topCenter", "bottomCenter", "0", "0"]; } // Overlay
            else if (ccc === 7) { rule = ["bottomCenter", "topCenter", "0", "0"]; } // Nukta
            else if (ccc === 9) { rule = ["bottomCenter", "topCenter", "0", "0"]; } // Virama
            else if (ccc === 200) { rule = ["bottomLeft", "topRight", "0", "0"]; } // Attached Bottom Left
            else if (ccc === 202) { rule = ["bottomCenter", "topCenter", "0", "0"]; } // Attached Directly Below
            else if (ccc === 204) { rule = ["bottomRight", "topLeft", "0", "0"]; } // Attached Bottom Right
            else if (ccc === 208) { rule = ["midLeft", "midRight", "0", "0"]; } // Attached to Left
            else if (ccc === 210) { rule = ["midRight", "midLeft", "0", "0"]; } // Attached to Right
            else if (ccc === 212) { rule = ["topLeft", "bottomRight", "0", "0"]; } // Attached Top Left
            else if (ccc === 214) { rule = ["topCenter", "bottomCenter", "0", "0"]; } // Attached Directly Above
            else if (ccc === 216) { rule = ["topRight", "bottomLeft", "0", "0"]; } // Attached Top Right
            else if (ccc === 240) { rule = ["bottomRight", "topLeft", "0", "0"]; } // Iota Subscript
            else if (ccc === 6 || ccc === 8) { rule = ["topRight", "bottomLeft", "0", "0"]; } // Han/Kana Voicing
            
            // Group 2 (Non-Attached / Spacing) - Offset 50
            else if (ccc === 218) { rule = ["bottomLeft", "topRight", "-50", "50"]; }
            else if (ccc === 220) { rule = ["bottomCenter", "topCenter", "0", "50"]; }
            else if (ccc === 222) { rule = ["bottomLeft", "topRight", "-50", "50"]; }
            else if (ccc === 224) { rule = ["bottomRight", "topLeft", "50", "50"]; }
            else if (ccc === 228) { rule = ["midLeft", "midRight", "-50", "0"]; }
            else if (ccc === 230) { rule = ["topCenter", "bottomCenter", "0", "-50"]; }
            else if (ccc === 232) { rule = ["midRight", "midLeft", "50", "0"]; }
            else if (ccc === 233) { rule = ["topLeft", "bottomRight", "-50", "-50"]; }
            else if (ccc === 234) { rule = ["topRight", "bottomLeft", "50", "-50"]; }

            // Group 3 (Fallback for Fixed Position Classes)
            else if (ccc >= 10 && ccc <= 199) {
                rule = ["topCenter", "bottomCenter", "0", "-50"];
            }
        }

        // --- TIER 4: MANUAL RULE-BASED FALLBACK ---
        if (!rule) {
            rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);
        }

        if (rule) {
            const [baseAttachName, markAttachName, xOffsetStr, yOffsetStr] = rule;
            let baseAttachPoint = getAttachmentPointCoords(baseBbox, baseAttachName as AttachmentPoint);
            
            if (xOffsetStr !== undefined && yOffsetStr !== undefined) {
                const xOffset = parseFloat(xOffsetStr) || 0;
                const yOffset = parseFloat(yOffsetStr) || 0;
                baseAttachPoint = { x: baseAttachPoint.x + xOffset, y: baseAttachPoint.y + yOffset };
            }

            const markAttachPoint = getAttachmentPointCoords(markBbox, markAttachName as AttachmentPoint);
            offset = VEC.sub(baseAttachPoint, markAttachPoint);
        } else {
             // Final Fallback: Side-by-side placement
             const baseRsb = baseChar.rsb ?? metrics.defaultRSB;
             const markLsb = markChar.lsb ?? metrics.defaultLSB;
             const targetX = baseBbox.x + baseBbox.width + baseRsb;
             const dx = (targetX + markLsb) - markBbox.x;
             offset = { x: dx, y: 0 };
        }
    }
    
    // Apply constraints
    if (movementConstraint === 'horizontal') {
        offset.y = 0;
    } else if (movementConstraint === 'vertical') {
        offset.x = 0;
    }

    return offset;
};
