import {
    Character,
    Point,
    MarkAttachmentRules,
    CharacterSet,
    FontMetrics,
    PositioningRules,
    BoundingBox,
    // FIX: Import the AttachmentPoint type to resolve TypeScript errors.
    AttachmentPoint
} from '../types';
import { VEC } from '../utils/vectorUtils';
import { expandMembers } from './groupExpansionService';

export const getAttachmentPointCoords = (bbox: BoundingBox, pointName: AttachmentPoint): Point => {
    const { x, y, width, height } = bbox;
    switch (pointName) {
        case 'topLeft': return { x, y };
        case 'topCenter': return { x: x + width / 2, y };
        case 'topRight': return { x: x + width, y };
        case 'midLeft': return { x, y: y + height / 2 };
        case 'center': return { x: x + width / 2, y: y + height / 2 };
        case 'midRight': return { x: x + width, y: y + height / 2 };
        case 'bottomLeft': return { x, y: y + height };
        case 'bottomCenter': return { x: x + width / 2, y: y + height };
        case 'bottomRight': return { x: x + width, y: y + height };
        default: return { x, y }; // Fallback
    }
};

/**
 * True when the positioning rule covering this base/mark pair (base in `rule.base`, mark in
 * `rule.mark`, after group expansion) has a GSUB feature tag, i.e. the pair forms a ligature.
 */
export const isGsubPositioningPair = (
    positioningRules: PositioningRules[] | null | undefined,
    baseName: string,
    markName: string,
    groups: Record<string, string[]>,
    characterSets?: CharacterSet[]
): boolean => {
    if (!positioningRules) return false;
    const rule = positioningRules.find(r =>
        expandMembers(r.base, groups, characterSets).includes(baseName) &&
        expandMembers(r.mark, groups, characterSets).includes(markName)
    );
    return !!rule?.gsub;
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
        // Project rules decide placement. (Two automatic tiers used to run first, based on the
        // Unicode Indic positional category and combining class, but neither ever matched: the
        // fetched data was nested one level deeper than the lookup expected, and
        // getCombiningClass returns names, not numbers. Had they worked, they would have
        // overridden the project's own rules. Removed rather than fixed.)
        rule = resolveAttachmentRule(baseChar.name, markChar.name, markAttachmentRules, characterSets, groups);

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
