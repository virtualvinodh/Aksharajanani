
import { CharacterSet, PositioningRules, MarkAttachmentRules, AttachmentClass, RecommendedKerning } from '../types';
import { deepClone } from '../utils/cloneUtils';

export interface RefactoringState {
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    recommendedKerning: RecommendedKerning[] | null;
    fontRules: any;
}

const getRefString = (name: string, type: 'group' | 'set') => {
    return type === 'group' ? `@${name}` : `$${name}`;
};

const replaceInArray = (arr: string[] | undefined, oldRef: string, newRef: string): string[] | undefined => {
    if (!arr) return undefined;
    return arr.map(item => item === oldRef ? newRef : item);
};

const replaceInExceptPairs = (arr: string[] | undefined, oldName: string, newName: string, type: 'group' | 'set'): string[] | undefined => {
    if (!arr) return undefined;
    // Exception pairs are stored as "BaseName-MarkName". 
    // Groups are referenced here? Usually not, but if they were:
    // This logic assumes resolved names usually, but if groups were supported here, we'd need regex.
    // For now, groups in exception pairs are rare/unsupported, but we'll leave this hook for future.
    return arr; 
};

// Recursive function to walk FontRules (GSUB/GPOS tree) and replace strings
const traverseAndReplace = (obj: any, oldRef: string, newRef: string): any => {
    if (typeof obj === 'string') {
        return obj === oldRef ? newRef : obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => traverseAndReplace(item, oldRef, newRef));
    }
    if (obj && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            // Handle key replacement if needed (rare for features, but maybe for specific rule maps)
            // Ideally keys are glyph names or group names.
            const newKey = key === oldRef ? newRef : key;
            newObj[newKey] = traverseAndReplace(obj[key], oldRef, newRef);
        }
        return newObj;
    }
    return obj;
};

export const renameGroupInState = (
    state: RefactoringState,
    oldName: string,
    newName: string,
    type: 'group' | 'set'
): RefactoringState => {
    const newState = deepClone(state);
    const oldRef = getRefString(oldName, type);
    const newRef = getRefString(newName, type);

    // 1. Rename Definition
    if (type === 'set') {
        newState.characterSets = newState.characterSets.map(set => {
            if (set.nameKey === oldName) return { ...set, nameKey: newName };
            return set;
        });
    } else {
        if (newState.groups[oldName]) {
            newState.groups[newName] = newState.groups[oldName];
            delete newState.groups[oldName];
        }
    }
    
    // 1.5 Update references inside Group Definitions (Fix for recursive groups)
    if (newState.groups) {
        Object.keys(newState.groups).forEach(key => {
            newState.groups[key] = replaceInArray(newState.groups[key], oldRef, newRef) || [];
        });
    }

    // 2. Update Positioning Rules
    if (newState.positioningRules) {
        newState.positioningRules = newState.positioningRules.map(rule => ({
            ...rule,
            base: replaceInArray(rule.base, oldRef, newRef) || [],
            mark: replaceInArray(rule.mark, oldRef, newRef) || [],
            ligatureMap: rule.ligatureMap // Complex map, handled if needed or deep traversal below handles it? 
            // ligatureMap keys are bases, values are objects with mark keys. 
            // Traverse manual fix for maps:
        }));
        
        // Deep traverse ligatureMap
        newState.positioningRules.forEach(rule => {
             if (rule.ligatureMap) {
                 const newMap: any = {};
                 Object.keys(rule.ligatureMap).forEach(baseKey => {
                     const effectiveBaseKey = baseKey === oldRef ? newRef : baseKey;
                     const innerMap: any = {};
                     const oldInner = rule.ligatureMap![baseKey];
                     Object.keys(oldInner).forEach(markKey => {
                         const effectiveMarkKey = markKey === oldRef ? newRef : markKey;
                         let val = oldInner[markKey];
                         if (val === oldRef) val = newRef;
                         innerMap[effectiveMarkKey] = val;
                     });
                     newMap[effectiveBaseKey] = innerMap;
                 });
                 rule.ligatureMap = newMap;
             }
        });
    }

    // 3. Update Mark Attachment Rules
    if (newState.markAttachmentRules) {
        const newRules: MarkAttachmentRules = {};
        Object.keys(newState.markAttachmentRules).forEach(baseKey => {
            const effectiveBaseKey = baseKey === oldRef ? newRef : baseKey;
            const innerRules: any = {};
            const oldInner = newState.markAttachmentRules![baseKey];
            
            Object.keys(oldInner).forEach(markKey => {
                const effectiveMarkKey = markKey === oldRef ? newRef : markKey;
                innerRules[effectiveMarkKey] = oldInner[markKey];
            });
            newRules[effectiveBaseKey] = innerRules;
        });
        newState.markAttachmentRules = newRules;
    }

    // 4. Update Classes
    const updateClasses = (classes: AttachmentClass[] | null) => {
        if (!classes) return null;
        return classes.map(cls => ({
            ...cls,
            members: replaceInArray(cls.members, oldRef, newRef) || [],
            applies: replaceInArray(cls.applies, oldRef, newRef),
            exceptions: replaceInArray(cls.exceptions, oldRef, newRef),
            // exceptPairs not typically using group refs
        }));
    };

    newState.markAttachmentClasses = updateClasses(newState.markAttachmentClasses);
    newState.baseAttachmentClasses = updateClasses(newState.baseAttachmentClasses);

    // 5. Update Kerning
    if (newState.recommendedKerning) {
        newState.recommendedKerning = newState.recommendedKerning.map(pair => {
            const newLeft = pair[0] === oldRef ? newRef : pair[0];
            const newRight = pair[1] === oldRef ? newRef : pair[1];
            if (pair.length === 3) return [newLeft, newRight, pair[2]];
            return [newLeft, newRight];
        });
    }

    // 6. Update Font Rules (GSUB/Lookups)
    // This is the heaviest part - recursive walk
    // We skip 'groups' key as we handled it explicitly above
    const { groups, ...restRules } = newState.fontRules || {};
    const updatedRest = traverseAndReplace(restRules, oldRef, newRef);
    newState.fontRules = { groups: newState.groups, ...updatedRest };

    return newState;
};
