# scripts.json Data Format Guide

The `scripts.json` file is the master registry for Aksharajanani project. It defines the available templates (scripts) that users can choose from when starting a project. It acts as the central configuration hub, linking visual settings, font metrics, and external data files.

## Root Structure

The file contains a default selection and an array of script configurations.

```json
{
  "defaultScriptId": "tamil",
  "scripts": [
    { ... script config object ... },
    { ... script config object ... }
  ]
}
```

---

## Script Configuration Object

Each object in the `scripts` array defines the blueprint for a specific writing system.

### 1. Identity & capabilities

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | **Required.** Unique identifier (e.g., `"tamil"`, `"latin"`). Used to load associated data files (see *File Naming Convention* below). |
| `nameKey` | `string` | Translation key for the display name (e.g., `"scriptTamil"`). |
| `support` | `string` | `"full"` or `"partial"`. Indicates the level of OpenType feature support in the template. |
| `kerning` | `string` | Optional. Set to `"true"` to enable the Kerning workspace by default for this script. |
| `touchingConsonants`| `string` | Optional. Set to `"true"` for scripts like Sinhala where characters touch, triggering specific rendering logic. |

### 2. Font Metrics (`metrics`)

Defines the vertical proportions of the font. **Note:** Canvas coordinates (`...Y`) are for the UI editor (0-1000 range), while Font metrics (`ascender`, `descender`) use standard font units.

```json
"metrics": {
  "unitsPerEm": 1000,          // Standard UPM
  "ascender": 800,             // Typographic ascender
  "descender": -200,           // Typographic descender
  "defaultAdvanceWidth": 800,  // Default width if not specified on glyph
  "defaultLSB": 50,            // Default Left Side Bearing
  "defaultRSB": 50,            // Default Right Side Bearing
  "spaceAdvanceWidth": 400,    // Width of the space character
  "styleName": "Regular",      // Sub-family name
  
  // UI Canvas Guides (0 = Top, 1000 = Bottom)
  "topLineY": 300,             // Visual top line
  "baseLineY": 700,            // Visual baseline
  "superTopLineY": 150,        // (Optional) Extra high line
  "subBaseLineY": 850          // (Optional) Extra low line
}
```

### 3. Application Defaults (`defaults`)

Sets the initial state of the editor settings when a user starts this script.

```json
"defaults": {
  "fontName": "MyFont",
  "strokeThickness": 25,       // Default pen width
  "pathSimplification": 0.5,   // Smoothing factor
  "contrast": 1.0,             // 1.0 = Monoline, <1.0 = Calligraphic
  "showGridOutlines": true,    // Show ghost letters in background
  "isAutosaveEnabled": true,
  "editorMode": "simple",      // 'simple' or 'advanced'
  "isPrefillEnabled": true     // Auto-fill composites with components
}
```

### 4. UI Configuration

Controls the appearance of specific workspace elements.

*   **Grid:**
    ```json
    "grid": {
      "characterNameSize": 450 // Font size for glyph names in the main grid
    }
    ```
*   **Test Page:**
    ```json
    "testPage": {
      "fontSize": { "default": 48 },
      "lineHeight": { "default": 1.5 }
    }
    ```
*   **Sample Text:**
    ```json
    "sampleText": "The quick brown fox..." // Default text for Test Page
    ```

### 5. Guide Font (`guideFont`)

Optional. Configures a reference font that appears behind the drawing canvas to help users trace or compare shapes.

```json
"guideFont": {
  "fontName": "Noto Sans Tamil",
  "fontUrl": "https://.../NotoSansTamil-Regular.ttf",
  "stylisticSet": "ss01" // Optional OpenType feature tag to activate
}
```

---

## File Naming Convention

The `id` field is used to automatically fetch the other configuration files for the script. If `id` is `"tamil"`, the app looks for:

1.  **Characters:** `/data/characters_tamil.json`
2.  **Positioning:** `/data/positioning_tamil.json`
3.  **Rules:** `/data/rules_tamil.json`
4.  **Sample Text:** `/data/sample_tamil.txt` (Optional override for `sampleText` string)
