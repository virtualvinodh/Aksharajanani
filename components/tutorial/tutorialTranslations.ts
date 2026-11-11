export type TutorialTranslations = Record<string, string>;

/**
 * Per-key fallback for tutorial strings: every key in `english` is present in the result,
 * and the localized string replaces it only when it is a non-empty string. A partly translated
 * locale therefore shows English for its missing keys instead of an empty tooltip.
 */
export const mergeWithEnglishFallback = (
    english: TutorialTranslations | null | undefined,
    localized: TutorialTranslations | null | undefined
): TutorialTranslations => {
    const merged: TutorialTranslations = { ...(english ?? {}) };
    for (const [key, value] of Object.entries(localized ?? {})) {
        if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
    }
    return merged;
};
