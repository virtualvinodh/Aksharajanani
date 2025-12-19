# Aksharajanani: Data Structure Spec (V26.2)

This document defines the absolute schema for project persistence, template blueprints, session state, and geometric models, including internal logic layers, sub-folder components, and service-level protocols.

---

## 1. Project Root & History Models

### A. Project Data (`ProjectData`)
Stored in IndexedDB `projects` store. This represents the total state of a font project.

| Field | Type | Description |
| :--- | :--- | :--- |
| `projectId` | `number` | Unique ID (Auto-increment PK). |
| `name` | `string` | User-defined project name. |
| `scriptId` | `string` | ID of the base script (e.g., "tamil"). |
| `settings` | `AppSettings` | Global config (Stroke, Contrast, Autosave). |
| `metrics` | `FontMetrics` | Vertical metrics (Ascender, Descender, UPM). |
| `characterSets` | `CharacterSet[]` | Glyph metadata and organization tabs. |
| `glyphs` | `[number, GlyphData][]` | Map: `Unicode` -> `Geometry`. |
| `kerning` | `[string, number][]` | Map: `L_Uni-R_Uni` -> `Manual Value`. |
| `markPositioning`| `[string, Point][]` | Map: `BaseUni-MarkUni` -> `Manual Offset`. |
| `fontRules` | `any` | Nested script logic (Features/Lookups) for FEA generation. |
| `positioningRules` | `PositioningRules[]` | Structural GPOS/GSUB logic blocks for UI Manager. |
| `markAttachmentRules`| `MarkAttachmentRules` | Point-to-point anchor snap definitions. |
| `markAttachmentClasses`| `AttachmentClass[]` | Mark syncing groups. |
| `baseAttachmentClasses`| `AttachmentClass[]` | Base syncing groups. |
| `recommendedKerning`| `RecommendedKerning[]`| Preset pair list for guided spacing. |
| `groups` | `Record<string, string[]>` | Manual glyph groups for FEA (@prefix). |
| `guideFont` | `GuideFont` | Background tracing font configuration. |
| `isFeaEditMode` | `boolean` | Manual OpenType code override flag. |
| `manualFeaCode` | `string` | Raw text for manual OpenType features. |
| `savedAt` | `string` | ISO 8601 modification timestamp. |

### B. Project Snapshot (`ProjectSnapshot`)
Stored in IndexedDB `snapshots` store for version history (limit 5 per project).
- `id`: `number` (Auto-increment PK).
- `projectId`: `number` (FK to project).
- `data`: `ProjectData` (Full state dump).
- `timestamp`: `number` (ms).
- `name`: `string` (Optional label).

---

## 2. Core Geometric Models

### A. Point & Vector (`Point`)
Basic 2D coordinate unit.
- `x`: `number`
- `y`: `number`

### B. Glyph Data Container (`GlyphData`)
The primary data object for any character's visual representation.
- `paths`: `Path[]` (Array of drawing paths).
- `_cache`: `object` (Optional performance cache).
    - `bbox`: `object` (Cached bounding box).
        - `data`: `BoundingBox | null`.
        - `strokeThickness`: `number`.

### C. Path Structure (`Path`)
- `id`: `string` (Unique UUID).
- `type`: `PathType` (`pen | line | circle | dot | curve | ellipse | calligraphy | outline`).
- `points`: `Point[]` (Control points for the renderer).
- `angle`: `number` (Used specifically by `calligraphy` type).
- `segmentGroups`: `Segment[][]` (Used specifically by `outline` type for nested loops/holes).
- `groupId`: `string` (Optional, links multiple paths for selection/transformation).

### D. Path Segment (`Segment`)
Used for cubic Bezier outlines (primarily from SVG imports).
- `point`: `Point` (Anchor).
- `handleIn`: `Point` (Relative coordinate of incoming control handle).
- `handleOut`: `Point` (Relative coordinate of outgoing control handle).

### E. Bounding Boxes
**Standard Bounding Box (`BoundingBox`):**
- `x`: `number` (Left).
- `y`: `number` (Top).
- `width`: `number`.
- `height`: `number`.

**Min/Max Bounding Box (`BBox`):**
Used in kerning and collision detection algorithms.
- `minX`, `maxX`, `minY`, `maxY`: `number`.

---

## 3. Metadata & Character Models

### A. Character Definition (`Character`)
- `unicode`: `number` (Primary ID).
- `name`: `string` (Friendly export name).
- `lsb`: `number` (Manual Left Side Bearing override).
- `rsb`: `number` (Manual Right Side Bearing override).
- `glyphClass`: `base | ligature | mark`.
- `composite`: `string[]` (List of component names for templates/copies).
- `link`: `string[]` (List of component names for live linked glyphs).
- `sourceLink`: `string[]` (Original link cache for relinking logic).
- `compositeTransform`: `ComponentTransform[]` (Positional overrides for components).
- `isCustom`: `boolean` (Flag for user-added characters).
- `advWidth`: `number | string` (Explicit advance width; 0 for non-spacing marks).
- `isPuaAssigned`: `boolean` (Flag if unicode was generated via internal PUA logic).
- `option`: `string` (Style variant key).
- `desc`: `string` (Description string).
- `if`: `string` (Conditional visibility key).
- `hidden`: `boolean` (UI visibility flag).

### B. Component Transformation (`ComponentTransform`)
Positional and scale overrides for elements within a composite or linked glyph.
- `scale`: `number` (Default: 1.0).
- `x`: `number` (X coordinate offset).
- `y`: `number` (Y coordinate offset).
- `mode`: `PositioningMode` (`relative | absolute | touching`).

### C. Character Set (`CharacterSet`)
A grouping of characters used for UI categorization and batch logic.
- `nameKey`: `string` (Translation key for the group name).
- `characters`: `Character[]` (List of character definitions in the set).

---

## 4. UI Runtime Session State

### A. Workspace & Tool Unions
- `Workspace`: `drawing | positioning | kerning | rules | metrics`.
- `Tool`: `pen | eraser | line | dot | circle | curve | select | pan | edit | ellipse | calligraphy | slice`.
- `FilterMode`: `none | all | completed | incomplete`.

### B. Localization (`LocaleInfo`)
- `code`: `Locale` (e.g., `'en' | 'ta' | 'de' | 'es' | 'fr' | 'hi' | 'kn' | 'ml' | 'si' | 'te'`).
- `nativeName`: `string`.

---

## 5. Sub-Folder Components & UI Logic

### A. Rules Sub-folder Logic
- **DistContextualRuleValue**: `{ target: string, space: string, left?: string[], right?: string[] }`. Used in `DistRulesEditor.tsx`.
- **RuleGroupKey**: `{ ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' }`. Internal mapping for `useRulesState`.

### B. Rules/Manager Sub-folder Logic
- **SmartOption**: `{ label: string, value: string, type: 'group' | 'char' | 'set' }`. Autocomplete structure for `SmartGlyphInput.tsx`.
- **ManagerTab**: `groups | rules | kerning`. View state for `PositioningRulesManager.tsx`.

### C. Positioning Sub-folder Logic
- **SiblingPair**: `{ base: Character, mark: Character, ligature: Character }`. Used in `ClassPreviewStrip.tsx`.
- **PositioningClassKey**: Structured string `BC:[idx]-MC:[idx]` used for class-based UI aggregation.

---

## 6. Service & Worker Protocols

### A. Python & Font Generation
- **Python Worker Protocol**: `init` | `compile` | `result`.
- **FontCacheEntry**: `{ projectId, hash, fontBinary }`.

### B. Render & Imaging
- **RenderOptions**: `{ strokeThickness, color, lineDash, contrast }`.
- **TraceOptions**: `{ ltres, qtres, pathomit, strokewidth }`.

---

## 7. Static Data Schemas

### A. Test Cases (`TestCase`)
Located in `data/test_cases.json`.
- `id`: `string`.
- `category`: `string`.
- `description`: `string`.
- `priority`: `high | medium | low`.

### B. Unicode Blocks (`UnicodeBlock`)
Located in `data/unicode_blocks.json`.
- `name`: `string`.
- `start`: `number` (dec).
- `end`: `number` (dec).

---

## 8. Specialized Component Models

### A. Creator Settings (`CreatorSettings`)
- `text`, `fontSize`, `textColor`, `bgColor`, `overlayOpacity`, `textAlign`, `aspectRatio`, `addShadow`, `textPos`, `bgImageData`.

### B. New Project Configuration (`NewProjectData`)
- `projectName`, `fontFamily`, `upm`, `ascender`, `descender`, `includeLatin`.

---

## 9. Search & Scoring Models

- `SearchQuery`: `{ raw, lower, unicodeHex, exactMatch, isEffective }`.
- `Scoring`: Relevance mapping (1: Exact Name/Unicode, 2: StartsWith, 3: Contains, 4: Unicode prefix).

---

## 10. Configuration Blueprints & Templates

### A. Script Blueprint (`ScriptConfig`)
The template used to initialize a new project for a specific language.
- `id`: `string` (e.g., "tamil").
- `nameKey`: `string`.
- `charactersPath`: `string`.
- `rulesPath`: `string`.
- `rulesFeaPath`: `string` (Optional path to static FEA file).
- `rulesFeaContent`: `string` (Optional raw FEA text content).
- `metrics`: `FontMetrics`.
- `sampleText`: `string` (Initial preview text).
- `defaults`: `ScriptDefaults` (Initial setting template).
- `grid`: `{ characterNameSize: number }`.
- `guideFont`: `GuideFont`.
- `testPage`: `TestPageConfig`.
- `support`: `string` ("full" | "partial").

### B. Script Defaults (`ScriptDefaults`)
The subset of settings provided as a template in a script configuration.
- `fontName`, `strokeThickness`, `contrast`, `pathSimplification`, `showGridOutlines`, `isAutosaveEnabled`, `editorMode`, `isPrefillEnabled`, `showHiddenGlyphs`, `showUnicodeValues`, `showGlyphNames`, `preferKerningTerm`.

### C. Font Metrics Schema (`FontMetrics`)
- `unitsPerEm`, `ascender`, `descender`, `defaultAdvanceWidth`, `topLineY`, `baseLineY`, `styleName`, `spaceAdvanceWidth`, `defaultLSB`, `defaultRSB`, `superTopLineY`, `subBaseLineY`.

---

## 11. Auxiliary Support Types

### A. Theme & Exporting
- **Theme**: `'light' | 'dark'`.
- **ExportingType**: `'export' | 'test' | 'create' | null`.
- **Locale**: `'en' | 'ta' | 'de' | 'es' | 'fr' | 'hi' | 'kn' | 'ml' | 'si' | 'te'`.

### B. Drawing & Transformation Types
- **PositioningMode**: `'relative' | 'absolute' | 'touching'`. Used in component assembly logic.
- **AttachmentPoint**: `'topLeft' | 'topCenter' | 'topRight' | 'midLeft' | 'midRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'`.
- **HandleType**: `'point' | 'handleIn' | 'handleOut'`. Used in edit tool hit-testing for Bezier control.
- **Handle**: `{ type: 'scale' | 'rotate' | 'move', direction: HandleDirection }`.
- **TransformState**: `{ rotate: number, scale: number, flipX?: boolean, flipY?: boolean }`. Standalone state for toolbar/batch logic.
- **TransformAction**: `{ type, target, startPoint, initialPaths, initialTransform, initialBox, handle }`.

### C. Structural Logic Blocks
- **PositioningRules**: `{ base: string[], mark: string[], gpos?: string, gsub?: string, ligatureMap?: Record<string, Record<string, string>>, movement?: 'horizontal' | 'vertical' }`.
- **AttachmentClass**: `{ name?: string, members: string[], exceptions?: string[], applies?: string[], exceptPairs?: string[] }`.
- **TestPageConfig**: `{ fontSize: { default: number }, lineHeight: { default: number } }`.

### D. Tools & Ranges
- **ToolRanges**: `{ strokeThickness: Range, pathSimplification: Range, contrast: Range }`.
- **SliderRange**: `{ min: number, max: number, step?: number }`.
- **Range**: `{ min: number, max: number, step?: number }`.

### E. Variant Groups
- **VariantGroup**: `{ optionKey: string, variants: Character[], description: string }`. Used in `ScriptVariantModal.tsx` for stylistic project initialization.

### F. Misc Project Meta
- **GuideFont**: `{ fontName: string, fontUrl: string, stylisticSet: string }`.
- **ScriptsFile**: `{ defaultScriptId: string, scripts: ScriptConfig[] }`.