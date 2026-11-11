import { describe, it, expect } from 'vitest';
import { mergeWithEnglishFallback } from './tutorialTranslations';

describe('mergeWithEnglishFallback', () => {
    it('uses the localized string when present and English for missing or empty keys', () => {
        const english = { next: 'Next', back: 'Back', kerningNav: 'Click **Kerning**' };
        const localized = { next: 'அடுத்து', back: '  ' };
        expect(mergeWithEnglishFallback(english, localized)).toEqual({
            next: 'அடுத்து',
            back: 'Back',
            kerningNav: 'Click **Kerning**',
        });
    });

    it('handles a missing file on either side', () => {
        expect(mergeWithEnglishFallback(null, { a: 'x' })).toEqual({ a: 'x' });
        expect(mergeWithEnglishFallback({ a: 'x' }, null)).toEqual({ a: 'x' });
    });
});
