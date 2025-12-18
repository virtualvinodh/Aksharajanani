# Aksharajanani: Comprehensive Technical Architecture

Aksharajanani is a high-performance, browser-native font engineering suite. It abstracts the complexity of OpenType (GSUB/GPOS) through a visual design interface. This document provides an exhaustive breakdown of the system's data architecture, functional logic, and state orchestration.

---

## 1. Data Architecture & Schema

The system uses a unified project state that is serialized into IndexedDB.

### A. Core Interface: `ProjectData`
| Property | Type | Description |
| :--- | :--- | :--- |
| `glyphs` | `[number, GlyphData][]` | Unicode-keyed vector path data. Serialized as entries for Map compatibility. |
| `characterSets` | `CharacterSet[]` | Hierarchical metadata for grid organization and PUA assignment. |
| `fontRules` | `JSON` | Structural representation of GSUB/GPOS features (Lookups, Features, Groups). |
| `markPositioning` | `[string, Point][]` | "BaseID-MarkID" keys mapping to visual Point offsets. |
| `kerning` | `[string, number][]` | "LeftID-RightID" keys mapping to horizontal spacing values. |
| `settings` | `AppSettings` | Global parameters: stroke width, contrast, autosave, and font metadata. |
| `metrics` | `FontMetrics` | UPM, Ascender, Descender, and Canvas Guide Y-coordinates. |

### B. Geometric Design Space
- **Normalization**: All internal drawing happens in a **1000x1000 coordinate system**.
- **Transformation logic**: During export, coordinates are scaled to the font's Units Per Em: `FontUnit = DesignUnit * (UPM / 1000)`.
- **Axis Inversion**: The Y-axis is inverted during conversion (Canvas: top-down; Font: bottom-up) via the formula: `FontY = ((1000 - CanvasY) * Scale) + Descender`.

---

## 2. State Management (Context Mesh)

State is strictly partitioned to ensure UI responsiveness, particularly in the virtualized grid.

- **`ProjectContext`**: The master orchestrator. Holds `ScriptConfig`, `CharacterSet` hierarchy, and the `dependencyMap` (tracks which glyphs are components of others).
- **`GlyphDataContext`**: **Performance Optimized**. Uses a React `useRef` to store the massive `Map<number, GlyphData>`. Updates trigger a `version` counter to refresh specific grid tiles without re-rendering the whole application.
- **`LayoutContext`**: UI shell state. Active workspace, `currentView` (Grid/Settings/Creator), modal stack, and persistent search/filter queries.
- **`SettingsContext`**: Global drawing parameters and OpenType metadata.
- **`LocaleContext`**: Bi-lingual i18n engine. Injects dynamic `@font-face` CSS rules into the DOM to render labels in native script.
- **`RulesContext`**: Stores the JSON feature tree. Tracks `hasUnsavedRules` to prevent navigation loss.
- **`Kerning/PositioningContexts`**: Domain-specific maps for spacing and attachment data.

---

## 3. Logic Orchestration (Hooks)

### A. Lifecycle & Persistence
- **`useProjectLoad`**:
    - **Hydration**: Fetches script assets (`data/*.json`) and merges with user settings.
    - **PUA Assignment**: Dynamically detects characters without Unicode and assigns codes starting at `U+E000` using an atomic cursor.
- **`useProjectPersistence`**:
    - **Dirty Checking**: Deep compares current JSON stringified state against `lastSavedState`.
    - **Autosave**: Implements a 1.5s debounce. Writes to IndexedDB.
- **`useExportActions`**:
    - **Caching**: Hashes project state. If the hash matches the DB `fontCache`, it serves the cached Blob instantly.

### B. The Composite Engine (`useGlyphActions`)
- **Cascading Update**: When a base glyph is saved, it performs an asynchronous **Breadth-First Search (BFS)** through the `dependencyMap`.
- **JIT Reconstruction**: For "Linked Glyphs," it calls `generateCompositeGlyphData` to recursively rebuild paths using anchor-point math, allowing shape changes to propagate instantly.

### C. Drawing Sub-system (`useDrawingCanvas`)
- **Event Routing**: Maps Pointer API events to tool hooks (`usePenTool`, `useSelectTool`, etc.).
- **Animation**: Implements a LERP-based (Linear Interpolation) zoom/pan system for smooth navigation.
- **`useSelectTool`**: Performs path-segment hit-testing and complex transformations (Proportional Scale, Pivot-based Rotation).
- **`useSliceTool`**: High-precision geometry. Uses line-segment intersection math to split `pen` paths or `outline` (closed loop) shapes.

---

## 4. Service Engines (Heavy Lifting)

### A. The Binary Factory (`fontService.ts`)
1. **Paper.js Context**: Every glyph is rendered into an isolated headless Paper scope.
2. **Boolean Cleanup**: Uses `unite()` to resolve self-intersections and correctly calculate winding order for holes (counters).
3. **OpenType Conversion**: Geometric segments mapped to `moveTo`, `lineTo`, and `curveTo` for `opentype.js`.
4. **Metrics Enforcement**: Shifts paths to satisfy `LSB` and sets `AdvanceWidth = BBox.width + LSB + RSB`.

### B. The FEA Compiler (`pythonFontService.ts`)
- Spawns a dedicated Web Worker running **Pyodide** (WASM Python).
- Installs `fonttools` at runtime via `micropip`.
- Compiles the generated Adobe FEA text into binary tables (GSUB/GPOS/GDEF) and patches the original OTF binary.

### C. The Kerning Engine (`kerningService.ts`)
- **Vertical Zoning**: Divides glyphs into Ascender/X-Height/Descender zones.
- **Binary Search**: Rapidly tests kerning values to find the tightest negative offset that maintains a "Target Optical Distance" in the X-Height zone while avoiding hard collisions in other zones.

### D. Image Tracing (`imageTracerService.ts`)
- Wraps `imagetracerjs` to convert pixels to segments.
- Uses Paper.js `subtract` logic to remove background artifacts and clean up resulting vector paths.

---

## 5. UI Component Hierarchy

- **`AppHeader`**: Host for the **Command Palette** (scoring logic in `searchUtils`) and Global Progress.
- **`DrawingWorkspace`**: Virtualized grid using `react-virtuoso`.
    - **`CharacterCard`**: Self-contained renderer. Caches its own canvas context.
- **`DrawingModal`**: The vector editor.
    - **`LinkedGlyphsStrip`**: Visual dependency map. Shows "Sources" and "Used In" with live-previews of changes.
- **`PositioningWorkspace`**: Dual-mode UI (Rule-based or Grid-based).
    - **`ClassPreviewStrip`**: Handles Attachment Class synchronization and dual-context switching.
- **`CreatorPage`**: High-resolution canvas using Pointer API for drag-and-drop text placement on social media cards.

---

## 6. Critical Functional Flows

### Workflow: Saving & Persistence
`DrawingCanvas` (Pointer Input) -> `useGlyphEditSession` (Local Undo Stack) -> `handleSaveGlyph` (Context Dispatch) -> `useProjectPersistence` (Debounced Save) -> `dbService` (IndexedDB write).

### Workflow: Font Export
`feaService` (Generate FEA) -> `fontService` (Generate Base OTF) -> `pythonFontService` (WASM Worker) -> `FontTools` (Patching) -> `dbService` (Cache Result) -> Browser (File Download).

### Workflow: Class-Based Positioning
`PositioningEditor` (Manual Move) -> `usePositioningActions` (Calculate Delta) -> `updatePositioningAndCascade` (Propagate Delta to Class Siblings) -> `characterDispatch` (Update Metadata) -> `glyphDataDispatch` (Update Composite Glyphs).

---

## 7. Performance Strategies

1. **Virtualization**: Prevents DOM bloat in fonts with thousands of glyphs.
2. **Immutable Maps**: Prevents shallow-comparison re-renders.
3. **Canvas Caching**: Glyphs are only re-drawn if their specific data or global stroke settings change.
4. **JIT Expansion**: Groups and classes are expanded into arrays only at the moment of use to keep the state tree lean.
5. **Scope Isolation**: `paper.PaperScope` instances prevent memory leaks during heavy geometric processing.