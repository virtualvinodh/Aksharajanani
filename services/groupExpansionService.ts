
import { Character } from '../types';

/**
 * Expands a list of items which may contain direct glyph names or group references (starting with $ or @)
 * into a flat array of unique glyph names.
 * Handles recursive groups (groups containing groups).
 */
export const expandMembers = (
    items: string[] | undefined,
    groups: Record<string, string[]>
): string[] => {
    if (!items || items.length === 0) return [];

    const result = new Set<string>();
    const visitedGroups = new Set<string>();

    const processItem = (item: string) => {
        const trimmed = item.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('$') || trimmed.startsWith('@')) {
            const groupName = trimmed.substring(1);
            
            // Prevent infinite recursion
            if (visitedGroups.has(groupName)) return;
            visitedGroups.add(groupName);

            const groupMembers = groups[groupName];
            if (groupMembers) {
                groupMembers.forEach(member => processItem(member));
            }
        } else {
            result.add(trimmed);
        }
    };

    items.forEach(item => processItem(item));
    return Array.from(result);
};

/**
 * Checks if a specific character name exists within a list (handling group expansion).
 */
export const isCharInList = (
    charName: string,
    list: string[],
    groups: Record<string, string[]>
): boolean => {
    // 1. Direct check (optimization)
    if (list.includes(charName)) return true;

    // 2. Group check
    // We iterate manually to avoid expanding everything if we find a match early
    const visitedGroups = new Set<string>();
    
    const checkRecursive = (currentList: string[]): boolean => {
        for (const item of currentList) {
            if (item === charName) return true;

            if (item.startsWith('$') || item.startsWith('@')) {
                const groupName = item.substring(1);
                if (!visitedGroups.has(groupName)) {
                    visitedGroups.add(groupName);
                    const members = groups[groupName];
                    if (members && checkRecursive(members)) return true;
                }
            }
        }
        return false;
    };

    return checkRecursive(list);
};
