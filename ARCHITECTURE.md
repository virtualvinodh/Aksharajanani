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
1.  **Pyodide Boot**: Triggered on `AppContainer` mount; installs `fonttools` via micropip.
2.  **Asset Injection**: Custom logo fonts (`Purnavarman_1`) and locale-specific fonts are injected into the DOM via dynamic `<style>` tags.
3.  **PUA Sync**: The `puaCursorRef` scans all glyphs to find the maximum existing PUA to ensure sequential stability for new additions.

---

## 2. Drawing & Interaction Logic

### A. Viewport Dynamics
- **Design Space**: Fixed **1000x1000 grid**.
- **Animation**: Viewport transitions use **Linear Interpolation (LERP)** with a factor of `0.2` for smooth panning/zooming.
- **Undo Buffer**: Limited to **20 states** per session to balance memory usage against complex glyph geometry.

### B. Command Palette & Search Scoring
The search engine uses a tiered scoring system (`searchUtils.ts`):
1.  **Score 1 (Highest)**: Exact Name Match (case-insensitive), Quoted strings (`"A"`), or Exact Unicode Hex Match (e.g., `0x0041`).
2.  **Score 2**: Starts-with Name match.
3.  **Score 3**: Contains Name match.
4.  **Score 4**: Partial Unicode Hex match (e.g., `U+0B`).

### C. Batch Operations
Triggered via the "Select" mode in the grid:
- **Bulk Transform**: Calculates the collective bounding box, identifies the center, and applies Scale/Rotate/Flip to all selected `GlyphData`.
- **Metrics Normalization**: Overwrites LSB/RSB values across the selection while preserving existing values for null inputs.

---

## 3. Font Engineering Pipeline

### A. Recursive Dependency Cascade (BFS)
When a source glyph is modified:
1.  A **Breadth-First Search** traverses the `dependencyMap`.
2.  **Linked Glyphs**: Receive a recursive shape/transform update.
3.  **Composite Glyphs**: Treated as "Bake-Once" templates and ignored by the cascade.
4.  **Sever & Bake**: On source deletion, the engine "bakes" the current geometry into all dependents and severs the metadata link.

### B. Feature Compilation (FEA)
- **Sanitization**: All identifiers (Groups, Classes, Lookups) are sanitized to remove spaces/illegal characters.
- **Lookup Ordering**: Managed via the `children` array in the `FeatureAST`, allowing lookups to be executed before or after inline rules.
