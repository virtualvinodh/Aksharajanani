# Aksharajanani Technical Architecture

Aksharajanani is a sophisticated browser-based font creation tool specifically designed for Indic scripts, but extensible to any Unicode-based system. It bridges the gap between manual drawing and complex OpenType engineering.

## 1. System Overview

The application follows a **Modular Hook-Based Architecture** leveraging React's Context API for state management, Web Workers for heavy computation, and Pyodide (Python in WASM) for specialized font engineering tasks.

### Core Tech Stack
- **UI Framework**: React (v18)
- **Styling**: Tailwind CSS
- **Vector Engine**: Paper.js (for geometric operations like union/intersection and smoothing)
- **Font Generation**: Opentype.js (for generating the base OTF binary)
- **Font Engineering**: Pyodide + FontTools (for Adobe FEA compilation and table patching)
- **Persistence**: IndexedDB (via `idb` library)

---

## 2. Data Flow Architecture

The data flow is centralized around a set of specialized Contexts that act as a "Single Source of Truth."

### A. Initialization Flow
1. **Script Selection**: User selects a script template (`scripts.json`).
2. **Project Hydration**: `useProjectLoad` hook fetches static data (`data/characters_*.json`, `data/rules_*.json`) and merges it with user settings.
3. **PUA Assignment**: Characters without standard Unicodes are assigned unique Private Use Area (PUA) codes via an atomic cursor.
4. **Dependency Mapping**: A `dependencyMap` is built to track which glyphs are components of others (e.g., `ka` is a component of `ka-i`).

### B. Editing Flow (The "Drawing" Workspace)
1. **Canvas Interaction**: `DrawingCanvas` uses `useDrawingCanvas` to route inputs to specific tool hooks (`usePenTool`, `useSelectTool`, etc.).
2. **State Commit**: Changes are pushed to `useGlyphEditSession`.
3. **Autosave**: If enabled, `useProjectPersistence` debounces changes and writes the `ProjectData` object to IndexedDB.
4. **Cascading Updates**: If a base glyph (e.g., `ka`) is saved, a recursive async process scans the `dependencyMap` and updates all "Linked Glyphs" (e.g., `ka-i`, `ka-u`) using `glyphRenderService`.

### C. Positioning & Rules Flow
1. **Geometric Rules**: `PositioningWorkspace` allows visual alignment of marks. Offsets are stored in `MarkPositioningMap`.
2. **Class Sync**: `usePositioningActions` implements "Attachment Classes." Updating a "Class Representative" triggers a geometric cascade to all "Sibling" pairs using anchor-point math.
3. **FEA Generation**: `feaService` translates the internal JSON rules and positioning maps into a raw Adobe FEA (Feature File) string.

### D. Export Flow
1. **Base Binary**: `fontService` converts internal vector paths into standard font outlines using Opentype.js.
2. **Python Worker**: The base binary and the generated FEA string are sent to a background Web Worker.
3. **Compilation**: Inside the worker, Pyodide executes `fontTools` to compile the FEA into OpenType tables (GSUB/GPOS) and patches the font binary.
4. **Persistence**: The final patched binary is cached in IndexedDB to speed up subsequent "Test" or "Export" actions.

---

## 3. Module Breakdown

### `contexts/` (State Layer)
- **ProjectContext**: Stores structural metadata (Character Sets, Font Rules, Positioning).
- **GlyphDataContext**: Optimized storage for heavy path data using a React `ref` and versioning to prevent unnecessary re-renders of the entire grid.
- **LayoutContext**: Manages UI state (active workspace, modal stack, navigation targets).

### `hooks/` (Logic Layer)
- **useAppActions**: The "Controller" that coordinates high-level operations (Save/Load/Export).
- **useGlyphEditSession**: Manages the lifecycle of the drawing modal, including undo/redo and dirty checking.
- **useDrawingCanvas**: The bridge between DOM events and vector logic.
- **useRulesState**: Manages the local state of the OpenType feature editor.

### `services/` (Service Layer)
- **fontService.ts**: The core logic for converting Paper.js paths to Opentype.js commands.
- **pythonFontService.ts**: Manages the Pyodide Web Worker lifecycle.
- **glyphRenderService.ts**: Pure geometric functions for Bounding Box (BBox) calculation, mark alignment, and composite generation.
- **dbService.ts**: Direct interface with IndexedDB for project and snapshot storage.

---

## 4. Performance Strategies

1. **Web Workers**: Font generation and FEA compilation are offloaded to workers to keep the UI responsive.
2. **Virtualization**: `react-virtuoso` is used in the `CharacterGrid` to handle hundreds of glyph canvases efficiently.
3. **JIT Expansion**: Glyph groups and classes are expanded "Just-In-Time" during rendering or export, rather than keeping massive flattened arrays in memory.
4. **Memoization**: Heavy geometric calculations (BBoxes) are cached on the `GlyphData` object itself and invalidated only when paths change.
5. **Debounced Persistence**: Database writes happen 1.5 seconds after the user stops typing/drawing to minimize I/O overhead.

---

## 5. Security & Isolation

- **Sanitization**: All user-defined names (groups, classes, font names) are passed through `sanitizeIdentifier` to ensure compliance with the Adobe FEA specification and prevent code injection.
- **Scope Isolation**: `paper.PaperScope` is used to create isolated environments for every geometric calculation, preventing memory leaks and state contamination between different glyphs.