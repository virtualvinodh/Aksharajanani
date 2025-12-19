# Aksharajanani: Data Structure Spec (V26.0)

This document defines the absolute schema for project persistence, template blueprints, session state, and geometric models, including internal logic layers, sub-folder components, and service-level protocols.

---

## 1. Project Root (`ProjectData`)
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

---

## 2. Core Geometric Models

### A. Point & Vector (`Point`)
Basic 2D coordinate unit.
- `x`: `number`
- `y`: `number`

### B. Path Structure (`Path`)
- `id`: `string` (Unique UUID).
- `type`: `PathType` (`pen | line | circle | dot | curve | ellipse | calligraphy | outline`).
- `points`: `Point[]` (Control points for the renderer).
- `angle`: `number` (Used specifically by `calligraphy` type).
- `segmentGroups`: `Segment[][]` (Used specifically by `outline` type for nested loops/holes).
- `groupId`: `string` (Optional, links multiple paths for selection/transformation).

### C. Path Segment (`Segment`)
Used for cubic Bezier outlines (primarily from SVG imports).
- `point`: `Point` (Anchor).
- `handleIn`: `Point` (Relative coordinate of incoming control handle).
- `handleOut`: `Point` (Relative coordinate of outgoing control handle).

### D. Bounding Boxes
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
- `lsb/rsb`: `number` (Manual side bearing overrides).
- `glyphClass`: `base | ligature | mark`.
- `composite`: `string[]` (List of component names for templates).
- `link`: `string[]` (List of component names for live linked glyphs).
- `sourceLink`: `string[]` (Original link cache for relinking).
- `compositeTransform`: `ComponentTransform[]` (Positional overrides for components).
- `advWidth`: `number | string` (0 for non-spacing marks).
- `hidden`: `boolean` (UI visibility flag).

---

## 4. UI Runtime Session State

### A. Workspace & Tool Unions
- `Workspace`: `drawing | positioning | kerning | rules | metrics`.
- `Tool`: `pen | eraser | line | dot | circle | curve | select | pan | edit | ellipse | calligraphy | slice`.
- `FilterMode`: `none | all | completed | incomplete`.

### B. State Machines & Modal Logic
- **ModalState**: `{ name, props }`.
- **DraggedPointInfo**: `{ type: 'freehand' | 'segment', pathId, pointIndex, segmentGroupIndex, segmentIndex, handleType }`.
- **TransformAction**: `{ type: 'move' | 'scale' | 'rotate', target: 'paths' | 'image', startPoint, initialPaths, initialTransform, initialBox, handle }`.

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

## 10. Configuration Blueprints & Script Templates

### A. Scripts File Schema (`ScriptsFile`)
Root structure of `scripts.json`.
- `defaultScriptId`: `string`.
- `scripts`: `ScriptConfig[]`.

### B. Script Blueprint (`ScriptConfig`)
The template used to initialize a new project for a specific language.
- `id`: `string` (e.g., "tamil").
- `nameKey`: `string` (i18n pointer).
- `charactersPath`: `string` (URL to character JSON).
- `rulesPath`: `string` (URL to feature JSON).
- `metrics`: `FontMetrics` (Script-specific baseline).
- `sampleText`: `string` (Default test string).
- `defaults`: `ScriptDefaults` (Initial app settings).
- `guideFont`: `GuideFont` (Reference font URL/name).
- `support`: `string` ("full" | "partial").

### C. Script Defaults (`ScriptDefaults`)
- `fontName`: `string`.
- `strokeThickness`: `number`.
- `pathSimplification`: `number`.
- `showGridOutlines`: `boolean`.
- `isAutosaveEnabled`: `boolean`.
- `editorMode`: `"simple" | "advanced"`.
- `isPrefillEnabled`: `boolean`.

### D. Font Metrics Schema (`FontMetrics`)
- `unitsPerEm`: `number` (Global scale).
- `ascender`: `number`.
- `descender`: `number`.
- `defaultAdvanceWidth`: `number`.
- `topLineY`: `number` (Visual guide).
- `baseLineY`: `number` (Visual guide).
- `styleName`: `string`.
- `spaceAdvanceWidth`: `number`.
- `defaultLSB`: `number`.
- `defaultRSB`: `number`.
- `superTopLineY`: `number` (Optional).
- `subBaseLineY`: `number` (Optional).