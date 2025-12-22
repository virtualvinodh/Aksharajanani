# Aksharajanani: Drawing Workspace Data Flow

This document outlines the architecture and data transformations that occur within the Drawing Workspace, from user input to persistent storage.

---

## 1. Input Mapping & Coordinate Systems

The drawing engine manages three distinct coordinate systems to ensure precision across different screen sizes and zoom levels.

### A. Viewport (Screen) Space
Raw pixels relative to the browser window.
* **Source**: `MouseEvent` (`clientX/Y`) or `TouchEvent`.
* **Captured By**: `useDrawingCanvas.ts` -> `getViewportPoint`.

### B. Canvas (DOM) Space
Pixels relative to the `<canvas>` element's bounding box, adjusted for high-DPI displays.
* **Transformation**: `(ViewportPoint - canvas.left) * (internalWidth / domWidth)`.

### C. Design (Design/EM) Space
The normalized **1000x1000** coordinate system where glyphs are actually defined.
* **Logic**: `getCanvasPoint` in `useDrawingCanvas.ts`.
* **Transformation**: `(CanvasPoint - viewOffset) / zoom`.
* **Persistence**: All coordinates stored in `ProjectData` are in this 1000x1000 space.

---

## 2. Path Generation Pipeline

When a user draws, data flows through several stages before becoming part of a glyph:

1.  **Live Interaction**: Tool hooks (`usePenTool`, `useShapeTool`) generate a `previewPath` stored in local state.
2.  **Path Finalization**: On `pointerUp`, the `previewPath` is assigned a UUID via `generateId()` and pushed to the `currentPaths` array.
3.  **Simplification**: For freehand tools, the **Ramer-Douglas-Peucker** algorithm (`simplifyPath.ts`) reduces the point count based on the `settings.pathSimplification` threshold.
4.  **Smoothing**: The renderer (`glyphRenderService.ts`) uses quadratic Bezier interpolation to turn discrete points into smooth curves during the draw call.

---

## 3. Session & History Management

The `useGlyphEditSession.ts` hook acts as a buffer between the raw canvas and the global project state.

*   **Local State**: `currentPaths` tracks the active geometry.
*   **Undo/Redo**: A `history` array (stack) captures snapshots of `currentPaths` after every discrete action.
*   **Draft State (Autosave)**: If "Enable Autosave" is ON, changes are pushed to `GlyphDataContext` with an `isDraft: true` flag every 500ms (debounced).
*   **Commit State (Save)**: When the user clicks "Save" or navigates, a full "Commit" save is triggered. This invokes the **Cascade Engine**.

---

## 4. The Cascade & Dependency Engine

Aksharajanani tracks how glyphs are constructed from one another using a `dependencyMap`.

### A. Dependency Discovery
On project load, `useProjectLoad.ts` scans all characters. If character **B** has character **A** in its `link` or `composite` array, an entry `A -> [B]` is added to the map.

### B. Recursive Updates
When glyph **A** is saved:
1.  `handleSaveGlyph` (in `useGlyphActions.ts`) identifies all dependents of **A**.
2.  **Filter**: It selects only **Linked** glyphs (those requiring automatic updates).
3.  **Baking**: For each dependent (e.g., **B**), it determines which components changed.
4.  **Transformation**: It applies local transforms (Scale, X/Y, Mode) defined in **B**'s `compositeTransform` to **A**'s new paths.
5.  **Reconstruction**: `updateComponentInPaths` replaces the old paths of **A** inside **B** with the new ones.
6.  **Recursion**: If **C** depends on **B**, the process repeats.

---

## 5. Persistence & Storage Flow

1.  **React State**: User modifies paths in `DrawingModal`.
2.  **Context Dispatch**: `GlyphDataContext` and `ProjectContext` are updated via `handleSaveGlyph`.
3.  **Dirty Checking**: `useProjectPersistence.ts` detects the change in global state.
4.  **Serialization**: The entire `ProjectData` object is stringified (deep copy).
5.  **IndexedDB**: `dbService.ts` writes the object to the `projects` store.
6.  **Cache Invalidation**: `dbService.deleteFontCache` removes any existing pre-compiled font binary for this project, forcing a re-compile on the next "Test" or "Export" action.

---

## 6. Rendering & Visual Feedback

### A. The Glyph Render Pipeline
The `renderPaths` function in `glyphRenderService.ts` handles the final visual transformation:
*   **Monoline**: Uses standard `ctx.stroke()`.
*   **Calligraphy/Contrast**: Calculates a 2D outline of the stroke (`getStrokeOutlinePoints`) and uses `ctx.fill()`.
*   **Outlines (SVG)**: Renders `segmentGroups` using the "Even-Odd" winding rule to correctly display holes (counters).

### B. Auto-Fit Logic
To ensure glyphs are always visible regardless of their drawing coordinates:
1.  `getAccurateGlyphBBox` calculates the true visual bounds of all paths.
2.  `useDrawingCanvas` calculates a `zoom` and `viewOffset` that centers this bounding box within the design area.
3.  This occurs automatically on glyph load unless `disableAutoFit` is true (e.g., in the Positioning Workspace).

---

## 7. Interaction & Tool Pipeline

The drawing canvas utilizes a modular tool system orchestrated by `useDrawingCanvas.ts`.

### 7.1 Input Routing
* **Capture**: All pointer events (`onMouseDown`, `onMouseMove`, `onMouseUp`) are captured at the canvas level.
* **Normalization**: Events are passed through `getCanvasPoint` to convert raw pixels to **Design Space** coordinates.
* **Dispatch**: Based on the `activeTool`, logic is handed off to specialized hooks (`usePenTool`, `useSelectTool`, etc.).

### 7.2 Sketching & Path Finalization
* **Continuous Input**: As the user drags (`usePenTool`), points are appended to a temporary list.
* **Visual Proxy**: These points are rendered as a "dash" preview on the canvas.
* **Commit on Up**: On `pointerUp`, the temporary list is converted into a `Path` object.
* **Simplification**: Before being added to `currentPaths`, the Ramer-Douglas-Peucker algorithm filters out redundant points based on distance thresholds, ensuring the vector data remains efficient.

### 7.3 Selection & Hit Testing
The `useSelectTool` manages two primary selection methods:
* **Point Click**: Utilizing `findPathAtPoint`, which performs a distance-to-segment check (within a tolerance of ~10px) to identify the topmost path under the cursor.
* **Marquee Select**: Dragging on empty space creates a `marqueeBox`. On `pointerUp`, the engine calculates the bounding box of every path. Paths whose bounding boxes intersect with the `marqueeBox` are added to the `selectedPathIds` Set.
* **Group Awareness**: If a selected path has a `groupId`, the selector automatically includes all other paths sharing that ID.

### 7.4 Transformation Mechanics
Transformations (Move, Scale, Rotate) are applied to the `selectedPathIds` in real-time:
1. **Action Trigger**: Grabbing a handle or the selection body sets a `transformAction` (e.g., `type: 'rotate'`).
2. **Delta Calculation**: Each mouse move calculates a delta relative to the start point (e.g., `angleDelta` or `scaleFactor`).
3. **Point Transformation**:
   * **Move**: `point + delta`.
   * **Rotate/Scale**: Points are transformed relative to the **selection center** (the centroid of the combined bounding box of all selected items).
4. **Coordinate Update**: The new coordinates are written back to the paths, which triggers a re-render.

### 7.5 Grouping Logic
* **Group Entry**: When multiple paths are selected and the user clicks "Group", a new unique `groupId` is generated and assigned to the `groupId` property of all selected `Path` objects.
* **Atomic Selection**: Subsequent selection clicks on any member of this group will select the entire set, treating them as a single rigid body for transformations.
* **Ungrouping**: Removes the `groupId` property, allowing paths to return to an independent state.

---

## 8. Project Hydration

Hydration is the process of translating a serialized `ProjectData` object or a static `ScriptConfig` into a functional, interactive application state.

### 8.1 Data Deserialization
When a project is loaded via `useProjectLoad.ts`:
1. **Source Discovery**: The app determines if it's loading a user project (from JSON/IDB) or a new script template.
2. **State Injection**: The raw object properties (Settings, Metrics, Glyph Arrays) are dispatched to their respective Context providers.
3. **Map Reconstruction**: Arrays of entries (e.g., `[unicode, GlyphData][]`) are converted back into high-performance `Map` objects for runtime access.

### 8.2 Identity & PUA Assignment
To ensure every character is addressable by the font compiler:
1. **Unicode Check**: Every character definition is scanned for a `unicode` property.
2. **Automatic Mapping**: If unmapped and the name is a single character, the native Unicode codepoint is assigned.
3. **PUA Assignment**: If the character is a custom ligature or unmapped string, the **PUA Generator** assigns a unique ID starting at `U+E000` (Private Use Area).
4. **Cursor Persistence**: The highest assigned PUA is tracked in a session ref to prevent ID collisions during rapid additions.

### 8.3 Dependency Graph Initialization
The `dependencyMap` is an in-memory graph used to drive the Cascade Engine:
1. **Scan**: On load, every character's `link` and `composite` arrays are inspected.
2. **Reverse Mapping**: If character **B** uses character **A**, an entry is made: `A -> Set[B]`.
3. **Efficiency**: Storing this as a `Map<number, Set<number>>` allows O(1) discovery of affected glyphs when a source shape is modified.

---

## 9. Project Export (JSON)

The JSON export provides a portable, self-contained snapshot of the entire font project, suitable for backup or sharing.

### 9.1 Data Gathering
The `getProjectState` function in `useProjectPersistence.ts` acts as the single source of truth for serialization:
1. **Flattening**: It collects state from all active Contexts (`Project`, `GlyphData`, `Kerning`, `Positioning`, `Rules`).
2. **Key Conversion**: `Map` and `Set` objects (which do not natively serialize to JSON) are converted into structured arrays of entries.
3. **Validation**: The object is checked against the `ProjectData` interface to ensure all required fields (Metrics, Script ID, Settings) are present.

### 9.2 Serialization & Download
1. **Stringification**: The collected object is passed through `JSON.stringify` with 2-space indentation for readability.
2. **Blob Generation**: A `Blob` of type `application/json` is created from the string.
3. **Sanitization**: The project name is sanitized (spaces to underscores) to create a safe filename.
4. **Trigger**: A virtual `<a>` tag is used to trigger the browser's download dialog.

---

## 10. Project Export (Template)

The Template export generates a "blueprint" of a script. It captures the architectural logic but removes all artistic content.

### 10.1 Structural Extraction
The `handleSaveTemplate` logic in `useExportActions.ts` clones the current project but performs a "Structural Strip":
1. **Geometry Purge**: Every entry in the `glyphs` map is replaced with an empty `GlyphData` object (`{ paths: [] }`).
2. **Vector Reset**: All manual offsets in the `markPositioningMap` are cleared.
3. **Spacing Reset**: All manual values in the `kerning` map are cleared.

### 10.2 Logic Preservation
Crucially, the template **retains**:
* **Character Sets**: All glyph names, Unicodes, and metadata (Classes, Bearings).
* **Font Rules**: All GSUB (Substitution) features, lookups, and global groups.
* **Positioning Rules**: The structural GPOS logic (which base connects to which mark).
* **Metrics**: Vertical metrics and UPM settings.

### 10.3 Output
The resulting file is a standard `.json` project file. When loaded, it provides a "Clean Start" for a script, where all the complex OpenType logic is pre-configured, allowing a new user to simply begin drawing.

---

## 11. Multi-Stage Font Compilation Pipeline (OTF Export)

The "Export Font" process is a sophisticated data bridge between JavaScript's vector math and Python's font engineering libraries.

### Stage 1: Geometry Compilation (Web Worker)
To prevent main-thread UI freezing, the initial conversion happens in a dedicated worker (`fontService.ts`):
1.  **Scope Initialization**: A `paper.js` scope is created within the worker.
2.  **Path Unioning**: For each glyph, individual drawn paths are united into a single binary shape using `paperPath.unite()`. This resolves self-intersections and handles holes via the "Even-Odd" winding rule.
3.  **Command Translation**: The resulting Paper.js geometry is translated into `opentype.js` path commands (`moveTo`, `bezierCurveTo`, etc.).
4.  **Coordinate Mapping**: Points are flipped (Canvas Y-down to Font Y-up) and scaled from 1000 units to the project's specific UPM.
5.  **Metrics Application**: LSB and RSB are applied by shifting commands and calculating the final `advanceWidth`.

### Stage 2: Adobe FEA Generation
While the worker processes geometry, the main thread runs `feaService.ts`:
1.  **Rule Expansion**: GPOS (Positioning) and GSUB (Substitution) rules are expanded from high-level definitions (e.g., `@vowels`) into individual glyph name mappings.
2.  **Anchor Calculation**: Manual offsets in `markPositioningMap` are combined with default anchor rules to produce precise `<anchor X Y>` strings.
3.  **Feature Assembly**: The data is concatenated into a standard Adobe Feature File (`.fea`) syntax string.

### Stage 3: Python Binary Patching (Pyodide)
The base font binary and the FEA string are sent to a persistent Python worker (`pythonFontService.ts`):
1.  **Library Loading**: Pyodide initializes the `fontTools` Python library.
2.  **FEA Compilation**: `fontTools.feaLib` parses the FEA string and builds the binary `GPOS`, `GSUB`, and `GDEF` tables.
3.  **CMAP Injection**: A custom Python script adds a Unicode CMap (Format 4/12) to ensure the font works correctly on both Windows and MacOS.
4.  **Serialization**: The patched `TTFont` object is compiled back into an ArrayBuffer.

### Stage 4: Hash-Based Caching
1.  **Hashing**: `simpleHash` generates a unique key for the current project state.
2.  **IndexedDB Storage**: The final `.otf` blob is stored in the `fontCache` store.
3.  **Instant Retrieval**: If the user clicks "Test" or "Export" again without modifying geometry or rules, the app serves the cached blob instantly, bypassing stages 1-3.
