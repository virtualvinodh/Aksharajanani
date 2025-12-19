# Aksharajanani Technical Architecture (V16.0)

Aksharajanani is a high-performance, browser-based font engineering suite. It uses a **Modular Hook-Based Architecture** with a decoupled vector engine and a Python-powered font compiler.

---

## 1. System Components & Lifecycle

### A. Core Technologies
- **UI Architecture**: React 18 (Functional Components, Context API).
- **Vector Engine**: Paper.js (Geometric operations, boolean path logic, smoothing).
- **Font I/O**: Opentype.js (Initial binary generation, path command mapping).
- **Font Engineering**: Pyodide (WASM) + FontTools (FEA compilation, GDEF generation, CMAP Format 12 patching).
- **Persistence Layer**: IndexedDB (via `idb`) with a tiered snapshot system.

### B. Initialization Routine
1.  **Pyodide Boot**: Triggered on `AppContainer` mount; installs `fonttools` via micropip. Reports granular status (`loadingPyodide`, `installingFonttools`) to the UI.
2.  **Asset Injection**: Custom logo fonts (`Purnavarman_1`) and locale-specific fonts are injected into the DOM via dynamic `<style>` tags.
3.  **PUA Sync**: The `puaCursorRef` scans all glyphs to find the maximum existing PUA to ensure sequential stability for new additions.

---

## 2. Drawing & Interaction Logic

### A. Viewport Dynamics
- **Design Space**: Fixed **1000x1000 grid**.
- **Animation**: Viewport transitions use **Linear Interpolation (LERP)** with a factor of `0.2` for smooth panning/zooming.
- **Undo Buffer**: Limited to **20 states** per session to balance memory usage against complex glyph geometry.

### B. Command Palette & Search Scoring
The search engine uses a tiered scoring system (`searchUtils.ts`) to prioritize results:
- **Tier 1 (95-100)**: Exact Name Match (case-insensitive), Quoted strings (`"A"`), or Exact Unicode Hex Match.
- **Tier 2 (90)**: Alias/Synonym Match (e.g., searching "Metrics" for Settings).
- **Tier 3 (80)**: Starts-with Name match.
- **Tier 4 (60)**: Contains Name match.

---

## 3. Core Data Flows

### A. Reactivity & Persistence Flow
1.  **Input**: User manipulates points in `DrawingCanvas`.
2.  **Local State**: `useDrawingCanvas` updates `currentPaths` in the `EditorContext`.
3.  **History**: Change is pushed to the `history` stack (Undo/Redo management).
4.  **Persistence**: `useProjectPersistence` observes the change and triggers a **1500ms debounced** save to `IndexedDB`. If "Autosave" is off, it only flags the project as "Dirty".

### B. Recursive Dependency Cascade (BFS)
When a source glyph (e.g., a stem) is modified:
1.  **Trigger**: `handleSaveGlyph` is called.
2.  **Map Lookup**: The system queries the `dependencyMap` for all glyphs where this character is a component.
3.  **Filter**: It identifies only **Linked Glyphs** (active sync). **Composite Glyphs** (baked copies) are ignored.
4.  **Search**: A **Breadth-First Search** traverses the tree to handle nested dependencies (e.g., Stem -> Letter -> Ligature).
5.  **Transform**: For each dependent, `updateComponentInPaths` recalculates local coordinates using the source's new geometry while preserving the child's specific `scale/x/y` transforms.

---

## 4. Font Generation Pipeline (Data Flow)

The conversion from visual design to a binary `.otf` file is a three-stage asynchronous pipeline orchestrated by `fontService.ts`.

### Stage 1: Data Aggregation & Preparation (Main Thread)
**Inputs**: Glyph Geometry (Drawing), GPOS Data (Positioning), GSUB Logic (Rules), and Metrics (Settings).

**Manipulations**:
- **Cache Check**: Generates a `cyrb53` hash of the project state. If the hash exists in the `fontCache` DB, the pipeline skips to the end and returns the cached Blob.
- **FEA Compilation**: `feaService.ts` translates abstract rules into Adobe FEA code.
- **Sanitization**: All identifiers pass through `sanitizeIdentifier` to ensure Adobe spec compliance (alphanumeric, no leading numbers).
- **Serialization**: Maps/Sets are converted to flat Arrays for Worker transfer.

### Stage 2: Geometric & Binary Construction (Worker A)
**Engine**: `opentype.js` + `paper.js`

**Manipulations**:
- **Coordinate Inversion**: Maps Canvas Y (top-down) to Font Y (bottom-up).
- **Path Expansion**: Monoline segments expand into solid outlines via Nib contrast math.
- **Boolean Resolution**: `paper.js` uses the `evenodd` winding rule to resolve overlapping strokes and create internal counters (holes).
- **Binary Assembly**: `opentype.js` builds the base `.otf` table structure.

### Stage 3: Python Feature Compilation & Patching (Worker B)
**Engine**: `fontTools` (Python library via Pyodide)

**Manipulations**:
- **GPOS/GSUB Table Building**: `fontTools.feaLib` parses the FEA string and injects tables.
- **Format 12 CMAP Patching**: A custom script injects a Segmented Coverage subtable for Plane 15 PUA support.
- **Checksum Recalculation**: Finalizes the binary for OS installation.