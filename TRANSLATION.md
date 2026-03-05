# Translation Guide for AksharaJanani

AksharaJanani aims to be accessible to font designers worldwide. We support multiple languages for the UI interface. This guide explains how to add a new language or update existing translations.

## 1. Translation Files

All translation files are located in the `public/locales` directory.

```
/public
  /locales
    en.json       # English (Source of Truth)
    ta.json       # Tamil
    de.json       # German
    es.json       # Spanish
    ...
```

### File Structure
The JSON files are flat key-value pairs (mostly).

```json
{
  "appName": "AksharaJanani",
  "newProject": "New Project",
  "export": "Export",
  ...
}
```

---

## 2. Adding a New Language

1.  **Create the File:**
    Copy `public/locales/en.json` to a new file named with your language code (e.g., `fr.json` for French).

2.  **Translate Values:**
    Translate the values (right side) of the JSON object. **Do not change the keys (left side).**

    *   **English:** `"save": "Save Project"`
    *   **French:** `"save": "Enregistrer le projet"`

3.  **Register the Language:**
    Open `src/contexts/LocaleContext.tsx` and add your language to the `supportedLocales` array.

    ```typescript
    export const supportedLocales: LocaleInfo[] = [
      { code: 'en', nativeName: 'English' },
      { code: 'fr', nativeName: 'Français' }, // Add this line
      // ...
    ];
    ```

4.  **Test:**
    Start the app (`npm run dev`), go to Settings, and switch the language to verify your changes.

---

## 3. Updating Translations

If new features are added, new keys will appear in `en.json`.

1.  **Check for Missing Keys:**
    We provide a script to identify missing translations.

    ```bash
    node check_translations.js
    ```

    This script compares all locale files against `en.json` and reports any missing keys.

2.  **Add Missing Keys:**
    Add the missing keys to your language file and provide translations.

---

## 4. Contextual Translations

Some terms might be ambiguous. Refer to the UI to understand the context.

*   **"Case"**: Could mean "Upper Case" or "Test Case".
*   **"Mark"**: Could mean "Diacritic Mark" or "To mark a checkbox".

If you are unsure, please ask in a GitHub issue or Pull Request.

---

## 5. Contributing

1.  Fork the repository.
2.  Create a branch: `git checkout -b translate-french`.
3.  Add/Update the JSON file.
4.  Update `LocaleContext.tsx` (if adding a new language).
5.  Submit a Pull Request!

Thank you for helping us reach more creators!
