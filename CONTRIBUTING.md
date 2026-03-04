# Contributing to AksharaJanani

We welcome contributions to expand the range of scripts supported by AksharaJanani! If you're passionate about a specific writing system, you can help by creating a **Script Template**.

A Script Template consists of four key components that define how the script behaves, looks, and functions within the font editor.

## 📦 Checklist for New Scripts

To add a new script (e.g., "Bengali"), you need to provide the following files:

1.  **Script Definition** (`scripts.json`) - The entry point.
2.  **Character Map** (`data/characters_[id].json`) - Defines the glyphs.
3.  **Positioning Rules** (`data/positioning_[id].json`) - Defines anchor points and mark positioning.
4.  **OpenType Rules** (`data/rules_[id].json`) - Defines complex logic (ligatures, reordering).

---

## 1. Script Definition (`scripts.json`)

The `scripts.json` file in the root directory acts as the registry. You need to add a new object to the `scripts` array.

**Example Block:**

```json
{
  "id": "bengali",
  "nameKey": "scriptBengali",
  "support": "full",
  "metrics": {
    "unitsPerEm": 1000,
    "ascender": 800,
    "descender": -200,
    "defaultAdvanceWidth": 800,
    "topLineY": 400,
    "baseLineY": 800,
    "styleName": "Medium",
    "spaceAdvanceWidth": 400,
    "defaultLSB": 50,
    "defaultRSB": 50
  },
  "defaults": {
    "fontName": "BengaliRegular",
    "strokeThickness": 25,
    "pathSimplification": 0.5,
    "showGridOutlines": true,
    "isAutosaveEnabled": true,
    "editorMode": "simple",
    "isPrefillEnabled": true
  },
  "grid": {
    "characterNameSize": 450
  },
  "guideFont": {
    "fontName": "Noto Sans Bengali",
    "fontUrl": "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansBengali/hinted/ttf/NotoSansBengali-Regular.ttf",
    "stylisticSet": ""
  },
  "testPage": {
    "fontSize": { "default": 48 },
    "lineHeight": { "default": 1.5 }
  }
}
```

For a detailed guide on this format, see [scripts_json.md](scripts_json.md).

---

## 2. Character Map (`data/characters_[id].json`)

This file defines every glyph in your script—consonants, vowels, marks, and conjuncts.

*   **File Name:** Must match the `id` from `scripts.json` (e.g., `characters_bengali.json`).
*   **Structure:** A JSON object where keys are "groups" (e.g., "vowels", "consonants") and values are arrays of character objects.

**Example:**
```json
{
  "consonants": [
    {
      "name": "ka",
      "unicode": 2437,
      "hex": "0985",
      "glyphClass": "base"
    }
  ]
}
```

For the full schema, see [characters_json.md](characters_json.md).

---

## 3. Positioning Rules (`data/positioning_[id].json`)

This file defines how combining marks (diacritics) attach to base characters. It uses an anchor-based system.

*   **File Name:** `positioning_[id].json`
*   **Function:** Defines anchors like `top`, `bottom`, `right` for bases and marks.

**Example:**
```json
{
  "anchors": {
    "ka": { "top": { "x": 400, "y": 800 } },
    "e_matra": { "top": { "x": 0, "y": 0 } }
  }
}
```

For the full schema, see [positioning_json.md](positioning_json.md).

---

## 4. OpenType Rules (`data/rules_[id].json`)

This file contains the logic for complex script behaviors, such as:
*   **Ligatures:** `k_ss_a` -> `ksha`
*   **Contextual Alternates:** Changing a glyph based on its neighbor.
*   **Reordering:** Moving pre-base matras to the left.

It supports a JSON-based abstraction of the OpenType Feature File syntax.

For the full schema, see [rules_json.md](rules_json.md).

---

## 🚀 How to Submit

1.  Fork the repository.
2.  Create a new branch: `git checkout -b add-script-bengali`.
3.  Add your 4 files (`scripts.json` update + 3 data files).
4.  Run the app locally to test: `npm run dev`.
5.  Submit a Pull Request!

Thank you for helping us democratize font creation for all languages!
