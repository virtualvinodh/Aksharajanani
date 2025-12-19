# Aksharajanani Technical Architecture (V16.0)

Aksharajanani is a high-performance, browser-based font engineering suite. It uses a **Modular Hook-Based Architecture** with a decoupled vector engine and a Python-powered font compiler.

---

## 1. System Components & Lifecycle

### A. Core Technologies
- **UI Architecture**: React 18 (Functional Components, Context API).
- **Vector Engine**: Paper.js (Geometric operations, boolean path logic, smoothing).
- **Font I/O**: Opentype.js (Initial binary generation, path command mapping).
- **Font Engineering**: Pyodide (WASM) + FontTools (FEA compilation, GDEF generation, CMAP Format 12 patching).
- **Persistence Layer**: IndexedDB (via `idb`) with a tiered snapshot and font-cache system.

### B. Initialization Routine
1.  **Pyodide Boot**: Triggered on `AppContainer` mount; installs `fonttools` via micropip. Reports granular status (`loadingPyodide`, `installingFonttools`) to the UI.
2.  **Asset Injection**: Custom logo fonts (`Purnavarman_1`) and locale-specific fonts are injected into the DOM via dynamic `<style>` tags.
3.  **PUA Cursor Recovery**: On project load, `puaCursorRef` scans all existing glyphs to find the maximum assigned PUA, ensuring subsequent "Quick Adds" follow a strictly increasing atomic sequence.

---

## 2. Core Architectural Patterns

### A. Unified Project Model (UPM)
Aksharajanani implements a **Self-Contained Project Model**. 
- **Portability**: Positioning rules, attachment classes, and group definitions are serialized into the `.json` project file.
- **JIT Expansion**: Groups (starting with `$`) are expanded "Just-In-Time" during rendering and export using the `groupExpansionService.ts`.

### B. Recursive Dependency Cascade (BFS)
When a source glyph is modified, a **Breadth-First Search** traversal identifies all linked descendants. 
- **Smart Update**: Instead of full regeneration, `updateComponentInPaths` recalculates local coordinates using the source's new geometry while preserving child-specific transforms.
- **Async Yielding**: To prevent UI lockup during heavy cascades, the logic yields control to the main thread every 5 glyphs processed.

### C. Concurrency & Threading Model
To maintain 60FPS UI performance, the engine offloads heavy tasks to two distinct workers:
1.  **Geometry Worker (`fontService.ts`)**: Handles the conversion of Paper.js paths to Opentype.js commands. It performs coordinate inversion and nib-contrast outline expansion.
2.  **Compilation Worker (`pythonFontService.ts`)**: Manages the Pyodide environment.
- **Optimization**: Both workers utilize **Transferable Objects**. Large `ArrayBuffer` data (font binaries) is transferred between threads rather than copied, eliminating memory overhead.

### D. State History & Undo Strategy
The drawing editor maintains a local history stack using a linear array of path states.
- **Memory Management**: The stack is capped at **20 states**. 
- **Deep Cloning**: Every change triggers a `structuredClone` (or recursive fallback) to ensure that past states in the history are not mutated by current canvas operations.

---

## 3. Data Flow: The Positioning Pipeline

The `markPositioningMap` is the central repository for all GPOS offsets. It is generated through a tiered pipeline:

1.  **Geometric Discovery**: The engine scans `PositioningRules`. If a Base/Mark pair is drawn but lacks an entry in the map, `calculateDefaultMarkOffset` determines a starting coordinate based on `markAttachmentRules` (e.g., `topCenter` to `bottomCenter`).
2.  **Manual Intervention**: User interactions in the `PositioningEditorPage` update the map with explicit `{x, y}` deltas. 
3.  **Class Propagation**: Updates to a **Class Representative** trigger a `SyncAttachmentClasses` routine. This calculates the **Anchor Delta** of the representative and applies it to all siblings in the `AttachmentClass`, effectively bulk-populating the `markPositioningMap`.

---

## 4. Font Generation Pipeline

1.  **State Hashing**: Hashes the project state using `cyrb53`. If the hash exists in IndexedDB, the binary is served from cache.
2.  **Geometry Worker**: Inverts coordinates, expands paths via Nib contrast math, and resolves boolean intersections using the `evenodd` rule.
3.  **Compilation Worker**: Pyodide compiles the FEA string (incorporating the `markPositioningMap` as GPOS lookups) into binary tables and applies the **Format 12 CMAP patch**.