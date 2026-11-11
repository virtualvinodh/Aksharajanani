/**
 * Checks the shape of a project before it is loaded, so a broken or foreign file is rejected
 * up front instead of half-replacing the open project (P6). Returns a reason, or null if usable.
 * Only checks what loading relies on; unknown extra fields are fine.
 */
export const validateProjectData = (data: unknown): string | null => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'the file is not a project';
    const p = data as Record<string, unknown>;
    if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) return 'project settings are missing';
    if (p.metrics !== undefined && (typeof p.metrics !== 'object' || p.metrics === null || Array.isArray(p.metrics))) return 'font metrics are invalid';
    for (const key of ['glyphs', 'kerning', 'suggestedKerning', 'ignoredKerning', 'markPositioning', 'characterSets'] as const) {
        if (p[key] !== undefined && p[key] !== null && !Array.isArray(p[key])) return `"${key}" is not a list`;
    }
    for (const key of ['glyphs', 'kerning', 'suggestedKerning', 'markPositioning'] as const) {
        const list = p[key];
        if (Array.isArray(list) && list.some(entry => !Array.isArray(entry) || entry.length !== 2)) return `"${key}" has invalid entries`;
    }
    if (Array.isArray(p.characterSets) && p.characterSets.some(set => !set || typeof set !== 'object' || !Array.isArray((set as { characters?: unknown }).characters))) {
        return 'a character set is invalid';
    }
    return null;
};
