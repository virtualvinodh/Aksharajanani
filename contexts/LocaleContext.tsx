
import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect, useRef } from 'react';
import { Locale, LocaleInfo } from '../types';

type Translations = {
    [key: string]: string;
};

type FetchedTranslations = {
    [key in Locale]?: Translations;
};

export const availableLocales: LocaleInfo[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'ta', nativeName: 'தமிழ்' }
];

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
  availableLocales: LocaleInfo[];
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const FONT_FACE_STYLE_ID = 'locale-font-face';
// Tailwind's default sans-serif stack for fallback
const SANS_SERIF_FALLBACK = `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`;


export const LocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>('en');
  // Initialize translations state to null to signify they haven't been loaded yet.
  const [translations, setTranslations] = useState<FetchedTranslations | null>(null);

  useEffect(() => {
    const fetchTranslations = async () => {
        try {
            const promises = availableLocales.map(loc => 
                fetch(`/locales/${loc.code}.json`).then(res => {
                    if (!res.ok) {
                        // For newly added locales, the file might not exist yet.
                        // We can ignore this error and it will fall back to the key.
                        if (res.status === 404) return [loc.code, {}];
                        throw new Error(`Failed to fetch translation for ${loc.code}`);
                    }
                    return res.json().then(data => [loc.code, data]);
                })
            );

            const allTranslations = Object.fromEntries(await Promise.all(promises));
            setTranslations(allTranslations as FetchedTranslations);

        } catch (error) {
            console.error("Failed to load translation files:", error);
            // In a real app, you might want to set an error state here
        }
    };
    
    fetchTranslations();
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    // This effect now depends on translations being loaded
    if (!translations || !translations[locale]) return;

    const currentTranslations = translations[locale];
    const fontName = currentTranslations?.fontNameLocale;
    const fontUrl = currentTranslations?.fontLocaleURL;

    // Clean up previous style tag
    const existingStyleElement = document.getElementById(FONT_FACE_STYLE_ID);
    if (existingStyleElement) {
        existingStyleElement.remove();
    }

    if (fontName && fontUrl) {
        const styleElement = document.createElement('style');
        styleElement.id = FONT_FACE_STYLE_ID;
        // Using 'truetype' format for .ttf files
        styleElement.innerHTML = `
          @font-face {
            font-family: "${fontName}";
            src: url('${fontUrl}') format('truetype');
            font-display: swap;
          }
        `;
        document.head.appendChild(styleElement);
        document.body.style.fontFamily = `"${fontName}", ${SANS_SERIF_FALLBACK}`;
    } else {
        // Revert to default font if no specific font for the locale
        document.body.style.fontFamily = ''; 
    }

    return () => {
        // On component unmount, reset body style and remove style tag
        document.body.style.fontFamily = '';
        const styleElement = document.getElementById(FONT_FACE_STYLE_ID);
        if (styleElement) {
            styleElement.remove();
        }
    };
  }, [locale, translations]);

  // Use a ref to store the latest locale and translations.
  // This allows the `t` function to have a stable identity while still accessing the latest values.
  const stateRef = useRef({ locale, translations });
  stateRef.current = { locale, translations };

  const t = useCallback((key: string, replacements?: { [key: string]: string | number }) => {
    const { locale, translations } = stateRef.current;

    if (!translations) {
        // Fallback to key if translations are not loaded yet.
        return key;
    }
    
    const localeTranslations = translations[locale] || {};
    const englishTranslations = translations['en'] || {};
    
    // Fallback logic:
    // 1. Try to find the translation in the currently selected locale.
    // 2. If not found, fall back to the English translation.
    // 3. If the English translation is also not found, use the raw key as the final fallback.
    let translation = localeTranslations[key] || englishTranslations[key] || key;

    if (replacements) {
        Object.keys(replacements).forEach(rKey => {
            // Use replaceAll to ensure all instances of the placeholder are replaced
            translation = translation.replaceAll(`{${rKey}}`, String(replacements[rKey]));
        });
    }
    return translation;
  }, []); // Empty dependency array makes `t` stable, preventing re-renders in consuming components.

  // Don't render children until the translations have been successfully fetched.
  if (!translations) {
    return null;
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, availableLocales }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = (): LocaleContextType => {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};
