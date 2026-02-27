# Aksharajanani: Data Structure Spec (V26.5)

This document defines the absolute schema for project persistence, template blueprints, session state, and geometric models, including internal logic layers, sub-folder components, and service-level protocols.

---

## 1. Project Root & History Models

### A. Project Data (`ProjectData`)
Stored in IndexedDB `projects` store. This represents the total state of a font project.

| Field | Type | Description |
| :--- | :--- | :--- |
| `projectId` | `number` | Unique ID (Auto-increment Primary-Key). |
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

### B. Creator Studio Settings (`CreatorSettings`)
Persistence model for the "Create" view.
- `text`: `string`.
- `fontSize`: `number`.
- `textColor`: `string`.
- `bgColor`: `string`.
- `overlayOpacity`: `number`.
- `textAlign`: `'left' | 'center' | 'right'`.
- `aspectRatio`: `'square' | 'portrait' | 'landscape'`.
- `addShadow`: `boolean`.
- `textPos`: `Point | null`.
- `bgImageData`: `string | null` (Base64).

### C. Project Snapshot (`ProjectSnapshot`)
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
- `_cache`: `object` (Internal performance cache for render services).
    - `bbox`: `object` (Cached bounding box to prevent expensive recalculations).
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

### F. Image Transformation (`ImageTransform`)
Defines the spatial properties of background reference images.
- `x`, `y`: `number` (Top-left coordinate).
- `width`, `height`: `number`.
- `rotation`: `number` (Rotation in radians).

---

## 3. Metadata & Character Models

### A. Character Definition (`Character`)
- `unicode`: `number` (Primary ID).
- `name`: `string` (Friendly export name).
- `label`: `string` (Optional display label/ghost text).
- `lsb`: `number` (Manual Left Side Bearing override).
- `rsb`: `number` (Manual Right Side Bearing override).
- `glyphClass`: `base | ligature | mark | virtual`.
- `composite`: `string[]` (List of component names for templates/copies).
- `link`: `string[]` (List of component names for live linked glyphs).
- `liga`: `string[]` (Ligature components for GSUB).
- `position`: `[string, string]` (Base/Mark pair for virtual assembly).
- `gpos`: `string` (GPOS feature tag).
- `gsub`: `string` (GSUB feature tag).
- `kern`: `[string, string]` (Left/Right pair for virtual assembly).
- `sourceLink`: `string[]` (Original link cache for relinking logic).
- `sourceLinkType`: `'position' | 'link' | 'kern'` (Type of original link).
- `sourceGlyphClass`: `'base' | 'ligature' | 'mark' | 'virtual'` (Original class).
- `compositeTransform`: `ComponentTransform[]` (Positional overrides for components).
- `isCustom`: `boolean` (Flag for user-added characters).
- `advWidth`: `number | string` (Explicit advance width; 0 for non-spacing marks).
- `isPuaAssigned`: `boolean` (Flag if unicode was generated via internal PUA logic).
- `option`: `string` (Style variant key).
- `desc`: `string` (Description string).
- `if`: `string` (Conditional visibility key).
- `hidden`: `boolean` (UI visibility flag).
- `optional`: `boolean` (Flag for optional glyphs).
- `isAutoAccepted`: `boolean` (Flag for auto-accepted positioning).

### B. Polymorphic Definition (`CharacterDefinition`)
Union type used during project initialization and script parsing.
- `CharacterSet` OR
- `{ recommendedKerning: RecommendedKerning[] }` OR
- `{ positioning: PositioningRules[] }` OR
- `{ markAttachment: MarkAttachmentRules }` OR
- `{ markAttachmentClass: AttachmentClass[] }` OR
- `{ baseAttachmentClass: AttachmentClass[] }` OR
- `{ groups: Record<string, string[]> }`.

### C. Component Transformation (`ComponentTransform`)
Positional and scale overrides for elements within a composite or linked glyph.
- `scale`: `number` (Default: 1.0).
- `rotation`: `number` (Default: 0).
- `x`: `number` (X coordinate offset).
- `y`: `number` (Y coordinate offset).
- `mode`: `PositioningMode` (`relative | absolute | touching`).

### D. Character Set (`CharacterSet`)
A grouping of characters used for UI categorization and batch logic.
- `nameKey`: `string` (Translation key for the group name).
- `characters`: `Character[]` (List of character definitions in the set).

---

## 4. UI Runtime Session State

### A. View & Workspace State
- `View`: `'grid' | 'comparison' | 'settings' | 'creator' | 'rules'` (Top-level application view).
- `Workspace`: `'drawing' | 'positioning' | 'kerning' | 'rules' | 'metrics'` (Navigation tabs).
- `Tool`: `pen | eraser | line | dot | circle | curve | select | pan | edit | ellipse | calligraphy | slice`.
- `FilterMode`: `'none' | 'all' | 'completed' | 'incomplete' | 'autoGenerated' | 'drawn' | 'base' | 'ligature' | 'mark' | 'toBeReviewed' | 'ignored'`.

### B. Localization (`LocaleInfo`)
- `code`: `Locale` (e.g., `'en' | 'ta' | 'de' | 'es' | 'fr' | 'hi' | 'kn' | 'ml' | 'si' | 'te'`).
- `nativeName`: `string`.

### C. Notifications & Modals
- **ModalState**: `{ name: string, props?: any }` (Controls global modal visibility).
- **NotificationState**: `{ message: string, id: number, type?: 'success'|'info'|'error', duration?: number, onUndo?: () => void }` (Schema for toast notifications).

### D. Unified Render Context (`UnifiedRenderContext`)
A consolidated context object passed to render services to avoid prop drilling.
- `glyphDataMap`: `Map<number, GlyphData>`.
- `allCharsByName`: `Map<string, Character>`.
- `markPositioningMap`: `MarkPositioningMap`.
- `kerningMap`: `KerningMap`.
- `characterSets`: `CharacterSet[]`.
- `groups`: `Record<string, string[]>`.
- `metrics`: `FontMetrics`.
- `markAttachmentRules`: `MarkAttachmentRules`.
- `strokeThickness`: `number`.
- `positioningRules`: `PositioningRules[]`.

---

## 5. State Mutation Protocols (Reducers)

### A. Character & Project Actions (`CharacterAction`)
- `SET_SCRIPT`: Initialize with script blueprint.
- `SET_CHARACTER_SETS`: Overwrite all character sets.
- `UPDATE_CHARACTER_SETS`: Functional update of character structure.
- `DELETE_CHARACTER`: Remove glyph and clean dependencies.
- `UPDATE_CHARACTER_METADATA`: Batch update of LSB, RSB, Class, Width, Label, Links.
- `UPDATE_CHARACTER_BEARINGS`: Specific side-bearing override.
- `ADD_CHARACTERS`: Inject new characters into a target set.
- `UNLINK_GLYPH`: Convert linked glyph to manual composite.
- `RELINK_GLYPH`: Restore live link from source cache.

### B. Glyph Geometry Actions (`GlyphDataAction`)
- `SET_MAP`: Overwrite entire drawing database.
- `UPDATE_MAP`: Functional update of geometry.
- `SET_GLYPH`: Update or add single glyph geometry.
- `BATCH_UPDATE_GLYPHS`: Parallel update of multiple glyph geometries.
- `DELETE_GLYPH`: Remove geometry for a unicode ID.

### C. Feature Logic Actions (`RulesAction`)
- `SET_FONT_RULES`: Overwrite GSUB/GPOS tree.
- `SET_FEA_EDIT_MODE`: Toggle manual code override.
- `SET_MANUAL_FEA_CODE`: Update raw text buffer.
- `SET_HAS_UNSAVED_RULES`: Flag dirty state for navigation guards.

### D. Settings & Metrics Actions (`SettingsAction`)
- `SET_SETTINGS`: Overwrite `AppSettings`.
- `UPDATE_SETTINGS`: Functional update of specific settings.
- `SET_METRICS`: Overwrite `FontMetrics`.
- `UPDATE_METRICS`: Functional update of specific metrics.

### E. Specialized Map Actions
- **`PositioningAction`**: `SET_MAP` for `MarkPositioningMap`.
- **`KerningAction`**: `SET_MAP` for `KerningMap`, `REMOVE_SUGGESTIONS`.
- **`ClipboardAction`**: `SET_CLIPBOARD` for `Path[]`.

---

## 6. Sub-Folder Components & UI Logic

### A. Rules Sub-folder Logic
- **DistContextualRuleValue**: `{ target: string, space: string, left?: string[], right?: string[] }`. Used in `DistRulesEditor.tsx`.
- **RuleGroupKey**: `{ ligature: 'liga', contextual: 'context', multiple: 'multi', single: 'single' }`. Internal mapping for `useRulesState`.
- **DistRuleType**: `'simple' | 'contextual'`. Union used in `useRulesState.ts`.
- **RefactoringState**: `{ characterSets, groups, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, fontRules }`. Used in `refactoringService.ts`.

### B. Rules/Manager Sub-folder Logic
- **SmartOption**: `{ label: string, value: string, type: 'group' | 'char' | 'set' }`. Autocomplete structure for `SmartGlyphInput.tsx`.
- **ManagerTab**: `groups | rules | kerning`. View state for `PositioningRulesManager.tsx`.

### C. Positioning Sub-folder Logic
- **SiblingPair**: `{ base: Character, mark: Character, ligature: Character }`. Used in `ClassPreviewStrip.tsx`.
- **PositioningClassKey**: Structured string `BC:[idx]-MC:[idx]` used for class-based UI aggregation.
- **ClassStatus**: Logic model for grid highlighting: `{ status: 'representative' | 'sibling' | 'unlinked' | 'none', representativeLabel?: string, classType?: 'mark' | 'base' }`.

---

## 7. Service & Worker Protocols

### A. Python & Font Generation
- **Python Worker Commands**: `init` | `compile`.
- **Python Worker Responses**: `status` | `result` | `error` | `init_error`.
- **Worker Status States**: `loadingPyodide` | `loadingMicropip` | `installingFonttools` | `ready`.
- **FontCacheEntry**: `{ projectId, hash, fontBinary }`.

### B. Render & Imaging
- **RenderOptions**: `{ strokeThickness, color, lineDash, contrast }`.
- **TraceOptions**: `{ ltres, qtres, pathomit, strokewidth }`.

---

## 8. Static Data Schemas

### A. Test Cases (`TestCase`)
Located in `data/test_cases.json`.
- `id`: `string`.
- `category`: `string`.
- `description`: `string`.
- `priority`: `high | medium | low`.
- **TestStatuses**: Persistence map: `Record<string, 'pending' | 'pass' | 'fail' | 'skip'>`.

### B. Unicode Blocks (`UnicodeBlock`)
Located in `data/unicode_blocks.json`.
- `name`: `string`.
- `start`: `number` (dec).
- `end`: `number` (dec).

---

## 9. Search & Scoring Models

- **SearchQuery**: `{ raw, lower, unicodeHex, exactMatch, isEffective }`.
- **Scoring**: Relevance mapping (1: Exact Name/Unicode, 2: StartsWith, 3: Contains, 4: Unicode prefix).
- **SearchResult**: Command palette model: `{ id, type, title, subtitle, aliases, icon, onExecute, unicode, character }`.

---

## 10. Component-Specific UI Models

### A. Import Diffs (`ComparisonItem`)
Used in `ImportGlyphsModal.tsx` to reconcile source and target projects.
- `unicode`: `number` (Target ID).
- `name`: `string`.
- `sourceGlyph`: `GlyphData`.
- `targetIsDrawn`: `boolean`.
- `targetCharExists`: `boolean`.

### B. New Project Flow (`NewProjectData`)
Captured in `NewProjectModal.tsx` to initiate a blank script project.
- `projectName`: `string`.
- `fontFamily`: `string`.
- `upm`: `number`.
- `ascender`: `number`.
- `descender`: `number`.
- `includeLatin`: `boolean`.

---

## 11. Configuration Blueprints & Templates

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
- `defaults`: `ScriptDefaults` (Initial template for `AppSettings`).
- `grid`: `{ characterNameSize: number }`.
- `guideFont`: `GuideFont`.
- `testPage`: `TestPageConfig`.
- `support`: `string` ("full" | "partial").
- `supportMessage`: `string` (Contextual help for partial support).
- `kerning`: `string` ("true" flag).
- `touchingConsonants`: `string` ("true" flag for specialized positioning).
- `characterSetData`: `CharacterDefinition[]` (Bundled JSON data).
- `rulesData`: `any` (Bundled JSON data).

### B. Script Defaults (`ScriptDefaults`)
Initial values used to populate `AppSettings` when a new project is created.
- `fontName`, `strokeThickness`, `contrast`, `pathSimplification`, `showGridOutlines`, `isAutosaveEnabled`, `editorMode`, `isPrefillEnabled`, `showHiddenGlyphs`, `showUnicodeValues`, `showGlyphNames`, `preferKerningTerm`.

### C. Font Metrics Schema (`FontMetrics`)
- `unitsPerEm`, `ascender`, `descender`, `defaultAdvanceWidth`, `topLineY`, `baseLineY`, `styleName`, `spaceAdvanceWidth`, `defaultLSB`, `defaultRSB`, `superTopLineY`, `subBaseLineY`.

---

## 12. Auxiliary Support Types

### A. Theme & Exporting
- **Theme**: `'light' | 'dark'`.
- **ExportingType**: `'export' | 'test' | 'create' | null`.
- **Locale**: `'en' | 'ta' | 'de' | 'es' | 'fr' | 'hi' | 'kn' | 'ml' | 'si' | 'te'`.

### B. Drawing & Transformation Types
- **PositioningMode**: `'relative' | 'absolute' | 'touching'`. Used in component assembly logic.
- **AttachmentPoint**: `'topLeft' | 'topCenter' | 'topRight' | 'midLeft' | 'midRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'`.
- **HandleType**: `'point' | 'handleIn' | 'handleOut'`. Used in edit tool hit-testing for Bezier control.
- **Handle**: `{ type: 'scale' | 'rotate' | 'move', direction: HandleDirection }`.
- **TransformState**: `{ rotate: number, scale: number, flipX?: boolean, flipY?: boolean }` (State model for batch/toolbar operations).
- **TransformAction**: `{ type, target, startPoint, initialPaths, initialTransform, initialBox, handle }`.
- **DraggedPointInfo**: (Union type for edit tool state)
    - **DraggedFreehandPointInfo**: `{ type: 'freehand', pathId: string, pointIndex: number }`.
    - **DraggedSegmentPointInfo**: `{ type: 'segment', pathId: string, segmentGroupIndex: number, segmentIndex: number, handleType: HandleType }`.

### C. Structural Logic Blocks
- **PositioningRules**: `{ base: string[], mark: string[], gpos?: string, gsub?: string, ligatureMap?: Record<string, Record<string, string>>, movement?: 'horizontal' | 'vertical' }`.
- **AttachmentClass**: `{ name?: string, members: string[], exceptions?: string[], applies?: string[], exceptPairs?: string[] }`.
- **TestPageConfig**: `{ fontSize: { default: number }, lineHeight: { default: number } }`.

### D. Tools & Ranges
- **ToolRanges**: `{ strokeThickness: Range, pathSimplification: Range, contrast: Range }`.
- **SliderRange**: `{ min: number, max: number, step?: number }`.
- **Range**: `{ min: number, max: number, step?: number }`.

### E. Runtime Map Representations
- **KerningMap**: `Map<string, number>` (Maps `"LeftUni-RightUni"` to numeric value).
- **MarkPositioningMap**: `Map<string, Point>` (Maps `"BaseUni-MarkUni"` to 2D offset).
- **PositioningGroupNames**: `Set<string>` (Prevents name collisions in Rules UI).

### F. Variant Groups
- **VariantGroup**: `{ optionKey: string, variants: Character[], description: string }`. Used in `ScriptVariantModal.tsx` for stylistic project initialization.

### G. Miscellaneous
- **SaveOptions**: `{ isDraft?: boolean, silent?: boolean }` (Flags for cascading save logic).
- **GuideFont**: `{ fontName: string, fontUrl: string, stylisticSet: string }`.
- **ScriptsFile**: `{ defaultScriptId: string, scripts: ScriptConfig[] }`.

---

## 13. Font Data (Reference)

This section documents the internal application data structures that are fundamentally required by the font compiler to produce a valid, installable OpenType binary.

### 1. The Geometric Source (`Path[]`)
- **Location**: Contained within the `glyphs` property of `ProjectData`.
- **Requirement**: At least one glyph (other than `.notdef` or `space`) must contain valid geometric paths.
- **Compiler Role**: These paths are converted into low-level `opentype.Path` commands (`moveTo`, `lineTo`, `curveTo`, `closePath`).

### 2. The Identity Mapping (`Character`)
- **Location**: Defined within `characterSets`.
- **Requirement**:
    - **`unicode`**: Every exportable character must have a unique decimal codepoint for the CMap lookup table.
    - **`name`**: Must have a PostScript-compatible name for internal referencing in FEA code.
    - **`glyphClass`**: Categorization (Base, Mark, or Ligature) is required to build the GDEF (Glyph Definition) table.

### 3. The Vertical Framework (`FontMetrics`)
- **Location**: The `metrics` property of `ProjectData`.
- **Requirement**:
    - **`unitsPerEm`**: The overall coordinate scale (standard: 1000).
    - **`ascender` / `descender`**: Global vertical boundaries that define the font's line height in OS/2 and hhea tables.

### 4. Horizontal Spacing (`Character` bearings)
- **Location**: Metadata properties on the `Character` object.
- **Requirement**:
    - **`lsb` (Left Side Bearing)**: Initial horizontal offset for the glyph outline.
    - **`rsb` (Right Side Bearing)**: Trailing horizontal space after the glyph outline.
    - **`advWidth` (Advance Width)**: For non-spacing marks, this must be explicitly set to `0` to ensure proper stacking in Indic scripts.

### 5. Script Intelligence (`fontRules` & `PositioningRules`)
- **Location**: The `fontRules` tree and `positioningRules` array.
- **Requirement**:
    - **GSUB (Substitution)**: Rules that define how character sequences map to ligatures.
    - **GPOS (Positioning)**: Derived from the `markPositioningMap`, these provide the X/Y anchor coordinates for dynamic mark placement.
    - **Output**: Compiled into the Adobe Feature File (`.fea`) syntax.

### 6. Identity Metadata (`AppSettings`)
- **Location**: Specific fields in the `settings` object.
- **Requirement**:
    - **`fontName`**: Essential for the 'Name' table (ID 1: Family Name, ID 4: Full Name).
    - **Authoring Strings**: `designer`, `manufacturer`, and `licenseDescription` are required for professional OS-level identification.