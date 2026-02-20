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
    *   **Live Links**: Characters with `link` property are always updated.
    *   **Virtual Composites**: Characters with `position` or `kern` properties are updated if they are not manually overridden (checked via `gpos` flag).
3.  **Baking**: For each dependent (e.g., **B**), it determines which components changed.
4.  **Transformation**: It applies local transforms (Scale, Rotation, X/Y, Mode) defined in **B**'s `compositeTransform` to **A**'s new paths.
5.  **Reconstruction**: `generateCompositeGlyphData` replaces the old paths of **A** inside **B** with the new ones.
6.  **Recursion**: If **C** depends on **B**, the process repeats.

---

## 15. Image Tracing Pipeline

The Image Tracer converts raster images into vector glyphs using a multi-stage process involving external libraries and geometric cleanup.

### 15.1 Raster Processing
1.  **Input**: User uploads an image or pastes a Data URL.
2.  **Preprocessing**: `traceImageToSVG` (in `imageTracerService.ts`) optionally removes the background color using pixel-difference thresholding on an HTML5 Canvas.
3.  **Vectorization**: The `imagetracer.js` library converts the processed bitmap into raw SVG path data.

### 15.2 Geometric Refinement
1.  **Import**: The raw SVG is imported into a headless `paper.js` scope.
2.  **Boolean Operations**:
    *   **Union**: Overlapping shapes are merged.
    *   **Subtraction**: White background shapes are subtracted from the main shape to create proper holes (counters).
3.  **Simplification**: The resulting path is simplified to reduce node count while maintaining visual fidelity.
4.  **Export**: The final geometry is extracted as an SVG string and converted into the application's internal `Path[]` format.

---

## 16. Refactoring & Renaming Pipeline

The Refactoring Service ensures data integrity when renaming core entities like Groups or Character Sets, which are referenced throughout the project.

### 16.1 Scope of Impact
Renaming a group (e.g., `@vowels` -> `@vowels_new`) requires atomic updates across:
*   **Character Sets**: Group definitions.
*   **Positioning Rules**: Base/Mark lists and Ligature Maps.
*   **Attachment Rules**: Anchor definitions keyed by group.
*   **Kerning**: Recommended pairs referencing the group.
*   **Font Rules**: The entire GSUB/GPOS feature tree (recursive traversal).

### 16.2 Execution Flow
1.  **Input**: `useRefactoring.ts` receives the rename request.
2.  **State Cloning**: A deep copy of the entire relevant project state is created.
3.  **Recursive Replacement**: `renameGroupInState` (in `refactoringService.ts`) walks through the state tree.
    *   **Strings**: Direct string matches are replaced.
    *   **Arrays**: Member lists are mapped and filtered.
    *   **Objects**: Keys and values are inspected and updated.
4.  **Atomic Commit**: The modified state objects are dispatched back to their respective Context providers in a single batch to prevent UI tearing.

---

## 17. Creator Studio Rendering

The Creator Studio provides a "What You See Is What You Get" (WYSIWYG) environment for testing fonts in graphical contexts.

### 17.1 Composition Layering
The `CreatorPage` canvas is built from multiple layers:
1.  **Background**: Solid color or user-uploaded image (scaled to `aspectRatio`).
2.  **Text Layer**: The current font is used to render the user's text.
    *   **Glyph Retrieval**: Geometries are fetched from `glyphDataMap`.
    *   **Layout**: Text is aligned (Left/Center/Right) and positioned (`textPos`).
    *   **Effects**: Shadow and Color are applied via Canvas API.
3.  **Overlay**: A semi-transparent color overlay is applied on top of the background but behind the text to improve contrast.

### 17.2 Export
*   **Rasterization**: The composite canvas is converted to a high-resolution PNG via `toDataURL`.
*   **Download**: The user can save the resulting image as a promotional asset.

---

## 18. Unified Render Context

To manage the increasing complexity of rendering parameters (Kerning, Positioning, Metrics, Rules), the application utilizes a `UnifiedRenderContext`.

### 18.1 The Problem
Previously, rendering a single glyph required passing 10+ individual props (Metrics, Kerning Map, Positioning Map, Rules, etc.) down through the component tree, leading to "Prop Drilling" and maintenance overhead.

### 18.2 The Solution
The `UnifiedRenderContext` object consolidates all necessary rendering data into a single structure:
*   `glyphDataMap` (Geometry)
*   `markPositioningMap` (Anchor Offsets)
*   `kerningMap` (Spacing Adjustments)
*   `metrics` (Vertical Alignment)
*   `rules` (Contextual Logic)

This context is passed to service-level functions like `renderGlyph` and `getGlyphBBox`, ensuring they always have access to the full typographic state without changing function signatures for every new feature.

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
3. **Spacing Reset**: All manual values in the `kerning` box are cleared.

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

---

## 12. Command Palette & Intent Mapping Pipeline

The Command Palette (`CommandPalette.tsx`) serves as the central orchestration layer for intent resolution, allowing users to jump to specific data states or execute global actions using natural-language-adjacent queries.

### 12.1 Index Construction (Static & Snapshot)
When the palette is opened (via `Ctrl+K`), it constructs a multi-source search index:
1.  **Action Index**: Global application methods (Save, Load, Export, Test) are mapped to searchable aliases (e.g., "Duplicate" -> "Save Copy").
2.  **Navigation Index**: Top-level workspaces (Drawing, Positioning, Kerning, Rules) are indexed with synonyms (e.g., "Spacing" -> "Kerning").
3.  **Data Snapshot**: Every character in the project is snapshotted. This includes its name, Unicode, and drawing status. Snapshotting at open-time ensures that real-time drawing strokes don't trigger expensive re-indexing during typing.

### 12.2 Query Parsing (The Smart Matcher)
The input string is passed through `parseSearchQuery` in `searchUtils.ts`, which detects structural intents:
1.  **Hex Detection**: If the query matches `U+[hex]` or `0x[hex]`, it is flagged as an explicit Unicode lookup.
2.  **Exact Match**: Quotes (e.g., `"A"`) trigger a strict case-sensitive match, prioritizing single characters over broader names.
3.  **Pair Resolution**: The palette attempts to split the query (e.g., "ka i"). If the components match a Base and Mark defined in the `positioningRules`, it maps the intent to a **Deep Positioning Link**.

### 12.3 The Scoring Engine (Ranking Relevance)
Matches are sorted using a tiered priority system to ensure the most useful intent is at the top (Index 0):
*   **Tier 1 (Relevance 1)**: Exact case-insensitive Name or Unicode Hex match.
*   **Tier 2 (Relevance 2)**: Match starts with the query.
*   **Tier 3 (Relevance 3)**: Query is contained within the name.
*   **Tier 4 (Relevance 4)**: Partial Unicode prefix matches.
*   **Conflict Resolution**: If two items share a relevance score, **Type Priority** decides the order (e.g., jumping to a Glyph is prioritized over switching a Workspace).

### 12.4 Deep Navigation Execution
Executing a result (e.g., a "Positioning Pair") involves a multi-context handoff:
1.  **Handoff**: The palette sets `pendingNavigationTarget` in the `LayoutContext` with a specialized identifier (e.g., `"2965-3007"`).
2.  **State Change**: It calls `setWorkspace('positioning')` to switch views.
3.  **Intercept**: The `PositioningPage` detects the `pendingNavigationTarget`, calculates its local index in the filtered grid, and automatically opens the `PositioningEditorPage` for that specific pair, effectively bypassing the main selection grid.

---

## 13. Smart Class Positioning & Propagation

The **Smart Class** system enables efficient synchronization of relational positions across large sets of glyphs. This data flow ensures that positioning a single mark on a single base character can update dozens of other semantically related pairs.

### 13.1 Edit Capture & Context Detection
When a user modifies a mark's position in `PositioningEditorPage.tsx`:
1. **Manual Offset**: The new `Point` is captured.
2. **Context Resolution**: The engine (`usePositioningActions.ts`) checks the `markAttachmentClasses` and `baseAttachmentClasses` to see if the current base or mark belongs to a class.
3. **Identity Mapping**: It identifies the "Class Representative" (usually the first member of the set).

### 13.2 Joint Delta Calculation
Instead of propagating raw absolute coordinates, Aksharajanani propagates a **Joint Delta**:
1. **Snap Point Discovery**: The engine retrieves the theoretical "Anchor Point" for the pair (e.g., `base:topCenter -> mark:bottomCenter`) based on `markAttachmentRules`.
2. **Manual Deviation**: It calculates the delta between this mathematical snap point and the user's manual placement: `AnchorDelta = ManualPoint - SnapPoint`.
3. **Relativity**: This delta represents the "human touch" or stylistic adjustment specific to that class interaction.

### 13.3 Propagation Cascade
The propagation logic in `positioningService.ts` loops through all eligible siblings in the identified class:
1. **Anchor Discovery**: For each sibling pair (e.g., `SiblingBase` + `Mark`), it calculates that pair's specific mathematical snap point.
2. **Delta Injection**: It applies the previously calculated `AnchorDelta` to this new snap point.
3. **Offset Generation**: The resulting coordinate is written to `markPositioningMap` for that sibling.
4. **Validation**: Propagation is skipped for any pair explicitly marked as "Unlinked" (Exceptions).

### 13.4 Persistence and Ligature Reconstruction
If the positioning rule is GSUB-based (requiring a baked ligature glyph):
1. **Reconstruction**: `generateCompositeGlyphData` is invoked for the primary pair and all affected siblings.
2. **Baking**: The new paths are written to the `GlyphDataContext`.
3. **Dispatch**: The global state is updated with a single atomic transaction.
4. **Feedback**: A success notification provides an **Undo** path, which snapshots and reverts the entire batch update if the results were unexpected.

---

## 14. Dependency Bootstrap & Environment Lifecycle

Aksharajanani is a "Fat Client" application that hydrtates multiple execution environments (JavaScript, Web Workers, and Python/WASM) upon startup.

### 14.1 Script Tag Injection (Bootloader)
Initialization begins in `index.html` via static `<script>` tags:
1.  **Base Libraries**: `paper-full.min.js`, `opentype.js`, and `imagetracerjs` are loaded into the global `window` scope.
2.  **Runtime Environment**: `pyodide.js` is loaded but not yet executed.
3.  **Module Mapping**: The `importmap` resolves ES modules for `react`, `idb`, and `vitest`.

### 14.2 App Container Mount
The `AppContainer.tsx` component orchestrates the secondary hydration:
1.  **Pyodide Initialization**: Calls `initializePyodide()` which spawns a dedicated Web Worker (`pythonFontService.ts`).
2.  **Logo Injection**: Dynamically injects a `@font-face` for the application's branding logo.
3.  **Metadata Fetching**: Retrieves `scripts.json` to populate the script selection screen.

### 14.3 Python Worker Lifecycle
The `pythonFontService.ts` executes a complex internal bootstrap:
1.  **WASM Fetching**: The worker downloads the Pyodide WASM binary (~10MB).
2.  **Micropip Setup**: Python's `micropip` module is initialized to manage virtual environment packages.
3.  **Dependency Installation**: The worker calls `micropip.install('fonttools')` to load the 3.5MB font engineering library into memory.
4.  **Signal**: The worker posts a `type: 'status', payload: 'ready'` message back to the main thread.

### 14.4 Project Asset Hydration
When a specific script (e.g., "Tamil") is selected:
1.  **Blueprint Fetching**: `useProjectLoad.ts` fetches `characters_[id].json`, `positioning_[id].json`, and `rules_[id].json`.
2.  **Guide Font Injection**: The `guide-font-face-style` element is created, fetching the reference `.ttf` file for tracing.
3.  **Sample Text Loading**: The `sample_[id].txt` file is fetched and injected into the "Test" page settings.

### 14.5 Garbage Collection & Cleanup
To maintain performance during long sessions:
1.  **Scope Disposal**: `paperScope.project.clear()` is called during every significant geometry operation (BBox calc, Export, Tracing) to prevent Canvas memory leaks.
2.  **Worker Termination**: Geometry compilation workers are ephemeral and call `self.close()` immediately after a task is completed.
3.  **Object URL Revocation**: `URL.revokeObjectURL()` is called after every font download or test page load to free browser memory buffers.
