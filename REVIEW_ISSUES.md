# Code review: open issues

Findings from the full code and functionality review (November 2026) that are **not** covered by the eight release-blocker fixes on the `claude` branch (commit `d7b04c8`).

Each issue has a stable ID, such as `E1`, so we can work through them one at a time. Tick the box when an issue is fixed and note the commit next to it.

**Legend**
- **Priority:** ⚠ = fix next (users hit it quickly, or it damages the font or user data); otherwise normal.
- **Confidence:** *confirmed* = reproduced by a script or in the browser, or traced end to end in the code; *likely* = clear from the code but not executed.
- **Line numbers** are from the review snapshot and may have drifted since.

**Already fixed on `claude`:** production export (minified worker), build missing data/locales, Devanagari crash, file-load project-ID clash, edits lost on close, rules edits lost, composite/linked glyphs missing from export, canvas-vs-font units for bearings and kerning. Uncaught export errors (spinner stuck) were fixed along with these.

---

## E: Font export and import

- [ ] **E1 ⚠ Pyodide init failure hangs export and import forever** (confirmed)
  - **Where:** `services/pythonFontService.ts` ~413–516.
  - **Problem:** `init_error` and `worker.onerror` never reject `pyodideReadyPromise`, and `worker` is never reset. If the CDN or PyPI fails (e.g. offline, or `micropip.install('fontFeatures')` fails), every `compileFeaturesAndPatch`, `patchFont` and `extractFea` awaits forever. `ImportFontModal` awaits `extractFea` with its close button disabled, so the dialog can't be dismissed. If the worker crashes after it was ready, later requests go to a dead worker.
  - **Fix:** keep the reject function and reject on `init_error`/`onerror`; null out `worker` so it can restart; add a per-request timeout.

- [ ] **E2 ⚠ Imported fonts come back rescaled and shifted** (confirmed)
  - **Where:** `services/importFontService.ts` 47–61, 129–136 vs `services/fontBuilder.ts` (outline transform).
  - **Problem:** import maps glyph y to canvas `600 - y`; export maps canvas to `(1000 - y)·(asc - desc)/1000 + desc`. These only cancel out when asc - desc = 1000 and desc = -400. Test: UPM 1000, hhea 900/-300. Glyph `A` [50,0,550,700] came back as [50,180,650,1020], 1.2× larger and raised 180 units, with its advance changed from 600 to 700.
  - **Fix:** derive the import mapping from the same formula as export: `y_canvas = 1000 - (y - desc)/k`.

- [ ] **E3 ⚠ Edit mode forces UPM to 1000 but keeps the base font's GPOS units** (confirmed by reading)
  - **Where:** `importFontService.ts` 47–51; `pythonFontService.ts` 178–213.
  - **Problem:** outlines and `head` are rescaled to 1000 UPM, while `patch_font` keeps the base font's GSUB/GPOS/GDEF values in their original units. Editing a 2048-UPM font makes all kerning and anchors about 2× too large.
  - **Fix:** in edit mode keep the original UPM at scale 1, or scale GPOS on patch (e.g. `fontTools.ttLib.scaleUpem`).

- [ ] **E4 ⚠ Edit-mode `patch_font` can crash or corrupt the cmap** (confirmed)
  - **Where:** `pythonFontService.ts` 180, 192–205.
  - **Problem:** hmtx and cmap are replaced wholesale from the delta font, but the base glyph order is kept.
    - A base glyph missing from the delta causes `KeyError` on save. Example: the base names ZWJ `zwj`, but the delta emits `uni200D`.
    - Secondary code points are lost (e.g. `space` serving both U+0020 and U+00A0).
    - PUA code points assigned on import leak into the cmap.
  - **Fix:** merge per glyph name into the base hmtx and cmap, and skip PUA code points that came from `isPuaAssigned`.

- [ ] **E5 ⚠ FEA class-name sanitising breaks or silently changes features** (confirmed with feaLib)
  - **Where:** `services/feaService.ts` 14, 425, 442.
  - **Problem:** `sanitizeIdentifier` strips non-ASCII characters and doesn't de-duplicate.
    - A group named `உயிர்` emits `@ = [...]`. feaLib fails, and the font ships with no GSUB or GPOS.
    - A user group named like a character set (e.g. `consonants`) is emitted twice, and the set's definition wins.
  - **Fix:** map names to unique ASCII identifiers (e.g. with a hash suffix), namespace character-set classes, and keep names to 63 characters or fewer.

- [ ] **E6 ⚠ Lookup flags produce invalid or partial FEA** (confirmed)
  - **Where:** `feaService.ts` 642–648, 732–737, 753–758.
  - **Problem:** each flag is emitted as `lookupflag ${name} ${value};`.
    - The documented `{"IgnoreMarks":"true"}` (rules_json.md:225) becomes `lookupflag IgnoreMarks true;`, which feaLib rejects. That kills all features.
    - Several flags become separate statements, and only the last applies.
  - **Fix:** emit one `lookupflag A B UseMarkFilteringSet @x;` statement, treat boolean values as bare flag names, and map `$group` to `@group`.

- [ ] **E7 Zero-width marks get wrong advances and anchors** (confirmed)
  - **Where:** `fontBuilder.ts` (zero-advance branch); `feaService.ts` ~857.
  - **Problem:**
    - `advWidth: 0` is honoured only when `glyphClass === 'mark'`. Devanagari `ं` (base, advWidth 0) is exported with advance = bbox + RSB, so a gap appears after every "कं".
    - Imported non-spacing marks are shifted to xMin=0, which breaks base GPOS anchors in edit mode.
    - mkmk anchors add the base's LSB even when the base is a zero-width mark.
  - **Fix:** gate the zero-advance rule on `advWidth === 0` alone, don't re-shift imported outlines, and use LSB 0 for zero-advance bases.

- [ ] **E8 Newer Indic script tags are missing** (confirmed by reading)
  - **Where:** `data/indicScripts.json`; `feaService.ts` 176–177, 232–233.
  - **Problem:** `dev2`, `knd2` and `gur2` (and `bng2`, `gjr2`, `ory2`) are missing, though the shipped rules use dev2, knd2 and gur2. User-defined ligatures in those scripts go into `liga` instead of akhn/blws/psts, which Windows Indic shaping doesn't apply.
  - **Fix:** add the v2 tags.

- [ ] **E9 Blank glyphs get the default 800-unit advance** (confirmed by reading)
  - **Where:** `fontBuilder.ts` (advance-width block); `importFontService.ts` 54.
  - **Problem:** undrawn Zs/Cf/Cc glyphs (NBSP, thin space, ZWSP…) get `defaultAdvanceWidth`. In edit mode this overwrites the base font's widths. The imported `char.advWidth` is never used.
  - **Fix:** use `char.advWidth` when set; otherwise 0 for Cf characters and the space width for Zs.

- [ ] **E10 Kerning only in `dist`, under a single `languagesystem`** (likely; depends on the renderer)
  - **Where:** `feaService.ts` ~318, ~899, ~946.
  - **Problem:** there's no `kern` feature and no `languagesystem DFLT dflt;`. Latin projects may lose kerning in apps that only apply `kern`, and Latin digits and punctuation in Indic fonts get no positioning.
  - **Fix:** emit pairs in `kern` for non-Indic scripts, and add DFLT.

- [ ] **E11 Remote code still unpinned** (confirmed)
  - **Where:** `pythonFontService.ts` 13, 251, 264; `index.html` 12; the inline workers in `hooks/actions/useGlyphActions.ts` ~39 and `services/autoKerningService.ts` ~6.
  - **Problem:**
    - `micropip.install('fontFeatures')` has no version or hash.
    - `index.html` loads Pyodide 0.25.0 on the main thread, but nothing uses it there (the worker uses 0.25.1).
    - The cascade and auto-kern workers load paper.js 0.12.17 from cdnjs, while the app bundles 0.12.18.
    - The `pyodide` and `unicode-name` npm dependencies are unused.
  - **Fix:** pin `fontFeatures==x.y` with a hash, remove the `index.html` script and the unused dependencies, and bundle paper.js into those workers (as was done for the font worker).

---

## D: Drawing and editing

- [ ] **D1 ⚠ Image tracer breaks paper.js for the rest of the session** (confirmed)
  - **Where:** `services/imageTracerService.ts` 106–107, 177–180.
  - **Problem:** `new paper.PaperScope().setup(canvas)` makes the tracer's scope the global active `paper`, and `scope.remove()` never switches back. Afterwards every `new paperScope.Path(...)` on the main thread throws `Cannot read properties of null (reading '_currentStyle')`. That breaks "insert as vector", outline bounding boxes during render, hover hit-testing, slice and edit double-click.
  - **Fix:** in `finally`, call `scope.remove()` and then `paperScope.activate()`, or reuse the shared scope with `project.clear()`.

- [ ] **D2 Image tracer output clipped to 300×150** (confirmed)
  - **Where:** `imageTracerService.ts` 104–107, 132–147.
  - **Problem:** the result is inverted against `scope.view.bounds`, which for a detached canvas is the default 300×150, and then the "first subpath" is dropped. A 1000×1000 image traces to a frame rectangle. Large images are also traced at full resolution on the main thread, on every slider change.
  - **Fix:** invert against the image bounds, pick the frame by its bounds rather than its position, and downscale before tracing.

- [ ] **D3 ⚠ Undo history wiped after every autosave** (confirmed by reading)
  - **Where:** `hooks/drawing/useGlyphEditSession.ts` 112–122.
  - **Problem:** the effect depends on `[activeEditorForceUpdate, glyphData]`, and the global counter never resets. After any batch operation touches the open glyph, every autosave resets `currentPaths` and the history (so undo is lost about 500 ms after each edit), can drop an in-progress stroke, and replaces regenerated composite paths with stale stored ones.
  - **Fix:** keep the last-handled counter in a ref, and reload only when it increments.

- [ ] **D4 ⚠ Dragging a newly clicked path moves the previously selected component** (confirmed by reading)
  - **Where:** `hooks/drawingTools/useSelectTool.ts` 168–184, 292–303, 345.
  - **Problem:** `activeComponentIndex` is set from the old selection and isn't cleared when the click selects a different path. The guard at ~566 is dead code.
  - **Fix:** reset it at the start of `start()`, and set it only once the final target is known.

- [ ] **D5 Transforming a component in a composite discards other edits** (confirmed by reading)
  - **Where:** `useGlyphEditSession.ts` 133–177.
  - **Problem:** `'move'` regenerates the whole glyph with `generateCompositeGlyphData`, dropping extra strokes and manual point edits and invalidating selection IDs. Paths with `component-N` group IDs on a glyph with neither `link` nor `composite` can't be moved at all.
  - **Fix:** transform only the `component-i` paths, and intercept only when `link` or `composite` is set.

- [ ] **D6 Double-click to add a point on an outline does nothing** (confirmed)
  - **Where:** `hooks/drawingTools/useEditTool.ts` 221, 259–264.
  - **Problem:** the location comes from one `paper.Path`, but `divideAt` is called on a different path, so it returns null. An unchanged history entry is still pushed.
  - **Fix:** `paperPath.curves[location.index].divideAtTime(location.time)`.

- [ ] **D7 Slice and eraser damage outlines and change stroke types** (confirmed by reading)
  - **Where:** `hooks/drawingTools/useSliceTool.ts` 66–98; `useEraserTool.ts` 141.
  - **Problem:**
    - Outline slicing uses only `segmentGroups[0]` and drops handles, so counters vanish and curves become chords.
    - Pieces come back as open `pen` strokes. Pen strokes are flattened with paper's `smooth()`, not the app's B-spline, so they bulge.
    - A `line` is treated as closed.
    - Eraser fragments are forced to `pen`.
  - **Fix:** use boolean operations for outlines (keeping type and handles), flatten with the app's `curveToPolyline`, and keep the original type and angle on fragments.

- [ ] **D8 Undo/redo doesn't restore `compositeTransform`** (confirmed by reading)
  - **Where:** `useGlyphEditSession.ts` 409–460.
  - **Problem:** after undoing a linked-component move, the paths revert but the transform stays moved and is saved.
  - **Fix:** store `{paths, compositeTransform}` in each history entry.

- [ ] **D9 Middle-button pan gets stuck on tools other than pan** (confirmed by reading)
  - **Where:** `hooks/useDrawingCanvas.ts` 343–364.
  - **Problem:** `endInteraction` only ends the pan when `tool === 'pan'`.
  - **Fix:** call `panTool.end()` whenever a pan is active.

- [ ] **D10 Dots can't be clicked or hovered** (confirmed by reading)
  - **Where:** `useDrawingCanvas.ts` 237–246.
  - **Problem:** a 1-point dot has no segments to hit-test.
  - **Fix:** special-case dots: hit when the distance to the centre is at most radius + tolerance.

- [ ] **D11 Backspace in a text field deletes the selected point** (confirmed by reading)
  - **Where:** `useEditTool.ts` 52–110.
  - **Problem:** the window keydown listener has no input/textarea guard, unlike `useDrawingShortcuts`.
  - **Fix:** add the same target guard.

- [ ] **D12 Pasted copies join the original's group** (confirmed by reading)
  - **Where:** `hooks/drawing/useCanvasOperations.ts` 50–57.
  - **Problem:** paste keeps the `groupId`, so the original and the copy are selected together. A pasted `component-N` group triggers D5.
  - **Fix:** give each pasted group a fresh ID.

- [ ] **D13 Name-matched glyph import can duplicate a unicode** (confirmed by reading)
  - **Where:** `components/ImportGlyphsModal.tsx` 236–245, 346–357.
  - **Problem:** a "new" character keeps the source unicode without checking the target. That gives two characters on one code point, an uncounted overwrite, and colliding selection state.
  - **Fix:** if the unicode is already taken, assign a PUA code point.

- [ ] **D14 Trackpad pinch and ctrl+wheel also zoom the page** (confirmed)
  - **Where:** `useDrawingCanvas.ts` 456–457; the same in `hooks/useKerningCanvas.ts` 128–144.
  - **Problem:** React's `onWheel` is passive, so `preventDefault()` is ignored.
  - **Fix:** attach a native `wheel` listener with `{passive: false}`.

---

## K: Kerning and positioning

- [ ] **K1 ⚠ Kerning editor tracks the pair by list index, so edits can land on the wrong pair** (confirmed swap; likely write)
  - **Where:** `components/KerningPage.tsx` 307–312, 326–336.
  - **Problem:** under the incomplete/toBeReviewed filters (or in Spaced after Reset), saving drops the pair from the list, and `editingIndex` silently points at the next pair. If an autosave fires mid-drag, the rest of the drag is written to the new pair.
  - **Fix:** store the pair key (`"L-R"`), not an index.

- [ ] **K2 ⚠ Kerning Next/Previous/Back skip the unsaved-changes check** (confirmed)
  - **Where:** `components/kerning/KerningEditorHeader.tsx` 137, 147, 160; `hooks/kerning/useKerningSession.ts` 171–182.
  - **Problem:** in manual mode, edits are discarded without a prompt. In autosave mode, navigating within 800 ms loses the last change.
  - **Fix:** route these buttons through `handleNavigationAttempt`, and flush the pending timer on navigation instead of clearing it.

- [ ] **K3 ⚠ Two `calculateDefaultMarkOffset` implementations disagree** (confirmed)
  - **Where:** `services/positioningHeuristicsService.ts` 113 vs `services/glyphRenderService.ts` 293.
  - **Problem:** with no `markAttachment` rule:
    - The editor, grid preview and export use the heuristics version, which places the mark side by side.
    - Confirm, accept-all, the cascades and FEA use the other version, which gives (0,0) for zero-width marks.
    - Example: ka+u shows an offset of (600,0) but saves (0,0), so the mark jumps. The class cascade then applies +600 to its siblings.
  - **Fix:** keep one implementation and route every caller through it.

- [ ] **K4 Background auto-kern uses the glyph from before the save** (confirmed)
  - **Where:** `contexts/KerningContext.tsx` 146–206, triggered from `useGlyphActions.ts` 589–599.
  - **Problem:** `processQueue` closes over the `glyphDataMap` from before the save, and queued pairs carry the old bearings. Suggestions always lag one save behind.
  - **Fix:** read the maps through refs, queue unicodes, and resolve bearings when the batch is built.

- [ ] **K5 Recommended-kerning targets resolved wrongly** (confirmed)
  - **Where:** `services/kerningService.ts` 99–114; worker path `useGlyphActions.ts` 507–511.
  - **Problem:** `null` becomes 0 ("kern until touching") instead of the default. Group rules (`$caps`) never match. The worker and main-thread paths treat `'lsb'`/`'rsb'` differently.
  - **Fix:** treat null as the default, resolve rules with `expandMembers` (exact pair before group), and share one resolver.

- [ ] **K6 Auto-Kern replaces all existing suggestions** (confirmed)
  - **Where:** `components/kerning/KerningSelectionView.tsx` 81.
  - **Problem:** it dispatches `SET_SUGGESTIONS`, which replaces the whole map. Unaccepted suggestions from earlier runs and from the background worker disappear.
  - **Fix:** use `MERGE_SUGGESTIONS`.

- [ ] **K7 Kerning worker results dropped or misrouted** (confirmed by tracing)
  - **Where:** `KerningContext.tsx` 112–139, 233–236.
  - **Problem:** `shouldDispatchDiscoveryRef` is a single global flag, so a background batch processed during "Detect new pairs" is discarded and never retried. `batchId` is sent but never checked. A second discovery call overwrites the first call's resolver, so the first promise never settles.
  - **Fix:** tag replies with `batchId`, and keep a map from batch ID to handler.

- [ ] **K8 Virtual ligature code points are unstable and can collide** (likely)
  - **Where:** `hooks/positioning/usePositioningData.ts` 62, 136–142; `usePositioningActions.ts` 341–353.
  - **Problem:** the counter restarts at 0x100001 on every recompute, so a new pair can reuse a persisted code point. That pair then vanishes from the grid, and baked data is shown for the wrong pair.
  - **Fix:** derive a stable ID from base+mark, or allocate above the highest existing code point.

- [ ] **K9 Copy Positions bakes outline marks in the wrong place** (confirmed)
  - **Where:** `usePositioningActions.ts` 319–322.
  - **Problem:** it translates `points` but not `segmentGroups`, and it bakes ligature glyphs even for GPOS-only pairs.
  - **Fix:** use the shared transform helper, and write glyph data only when the rule has `gsub`.

- [ ] **K10 Documented `center` anchor not implemented** (confirmed)
  - **Where:** `getAttachmentPointCoords` in `positioningHeuristicsService.ts` 56 and `glyphRenderService.ts` 220.
  - **Problem:** `center` falls through to topLeft.
  - **Fix:** add the case, and add it to the `AttachmentPoint` type.

- [ ] **K11 Positioning heuristics are dead code with inverted precedence** (confirmed)
  - **Where:** `positioningHeuristicsService.ts` 24–54, 147–180.
  - **Problem:** `getCombiningClass` returns strings, so the numeric checks never match, and the fetched JSON shape is parsed wrongly. The only effect is a wasted CDN fetch (unpinned `@main`) on load. If these tiers were fixed, they would override explicit project rules.
  - **Fix:** remove them, or fix the parsing and check project rules first.

- [ ] **K12 Auto-kern discovery is slow on large glyph sets** (likely)
  - **Where:** `services/autoKerningService.ts` 319–356.
  - **Problem:** `solvePair` recomputes paper.js zones for both glyphs of every one of the n² pairs.
  - **Fix:** cache zones per unicode from step 1.

- [ ] **K13 Propagation count and Undo are wrong when re-editing** (confirmed)
  - **Where:** `usePositioningActions.ts` 141; `components/UnifiedEditorModal.tsx` 179.
  - **Problem:** `newSize - oldSize - 1` gives -1 or 0 when the siblings already exist, so no toast or Undo appears.
  - **Fix:** count the sibling keys actually written.

- [ ] **K14 `isGsubPair` checks the base instead of the mark** (confirmed)
  - **Where:** `components/PositioningEditorPage.tsx` 165.
  - **Problem:** the Properties button never shows for GSUB pairs in the Positioning workspace.
  - **Fix:** use `props.markChar.name`.

- [ ] **K15 Kerning canvas zoom drift and stranded pagination** (confirmed)
  - **Where:** `useKerningCanvas.ts` 128–144; `KerningSelectionView.tsx` 53–65, 287.
  - **Problem:** wheel zoom ignores the centre translation, so it drifts about 40 px per step. `currentPage` is never reset, so a narrowed search shows "No results" with no pagination controls.
  - **Fix:** correct the zoom math, and reset to page 1 when the filter changes.

---

## P: Persistence and project lifecycle

- [ ] **P1 ⚠ Cascade worker killed on every LayoutContext change, so baked dependent glyphs go stale** (likely)
  - **Where:** `hooks/actions/useGlyphActions.ts` 438–471 (deps `[glyphDataDispatch, layout, t]`); `contexts/LayoutContext.tsx` 184 (`value` not memoized).
  - **Problem:** every notification, selection or keystroke terminates and recreates the worker, dropping queued jobs and re-importing paper.js from the CDN. `handleSaveGlyph` shows a notification right before posting the job. Linked glyphs look fine in the UI, because they're rebuilt live, but the export uses the stale stored data.
  - **Fix:** create the worker once and read `layout`/`t` through refs. Memoize the LayoutContext value.

- [ ] **P2 ⚠ Custom Script Loader projects can never be reopened** (confirmed by code path)
  - **Where:** `components/ScriptSelection.tsx` 243–299, 538–544; `components/CustomScriptLoader.tsx` 66.
  - **Problem:** the script keeps the uploaded `id` (e.g. `"grantha"`), but `handleProjectClick` only rebuilds configs for `custom_blocks_`/`project_` IDs. The dashboard shows "Could not find script configuration…" and the data is stranded.
  - **Fix:** prefix custom IDs, store the full ScriptConfig in ProjectData, and fall back to a generic rebuild.

- [ ] **P3 ⚠ No multi-tab or DB-version coordination** (confirmed: the handling is absent)
  - **Where:** `services/dbService.ts` 13–61.
  - **Problem:**
    - `updateProject` is a blind `put`, so two tabs on one project erase each other's work, and a project deleted in one tab is recreated by another tab's autosave.
    - There are no `blocked`/`versionchange` handlers, so the next DB_VERSION bump hangs while an old tab is open.
    - The v3→v4 upgrade deleted the snapshot store without migrating it.
  - **Fix:** use BroadcastChannel or Web Locks per project (or a revision check), and add blocked/blocking handlers.

- [ ] **P4 "Unsaved changes" flag turns on again after every save and load** (confirmed)
  - **Where:** `hooks/actions/useProjectPersistence.ts` ~78–90.
  - **Problem:** `lastSavedState` and `isScriptDataLoading` are effect triggers, so the flag is set right after a save or load. In manual mode the indicator never clears and the "change script"/"load project" confirmations always appear. (The new close prompt uses an exact check, so it isn't affected.)
  - **Fix:** derive dirtiness from an edit counter compared against the counter at save time.

- [ ] **P5 Snapshot restore marked as saved, so it is silently undone** (likely)
  - **Where:** `hooks/actions/useProjectLoad.ts` ~366; `hooks/useAppActions.ts` 229–238.
  - **Problem:** after a restore, `lastSavedState` is set to the restored data, so no save happens and the DB keeps the pre-restore version.
  - **Fix:** for restores, set `lastSavedState` to null or save immediately.

- [ ] **P6 Loading is destructive before validation; a failed load can autosave junk** (likely)
  - **Where:** `useProjectLoad.ts` 65–68, ~347.
  - **Problem:** contexts are reset before validation. A file missing `settings` then throws, and autosave can write a hybrid record (old settings, empty glyphs).
  - **Fix:** validate and build the new state first, and disable autosave while `scriptDataError` is set.

- [ ] **P7 Save races: duplicate projects, and "save & continue" doesn't wait** (likely)
  - **Where:** `useProjectPersistence.ts` 108–112; `useAppActions.ts` 162; `useProjectLoad.ts` (onSaveAndConfirm).
  - **Problem:** a double Ctrl+S on a new project calls `addProject` twice. "Save & change" and "Save & load" don't await the save, so a failed save (e.g. QuotaExceeded) is reported after the work is already gone.
  - **Fix:** serialize saves through an in-flight promise, await them, and abort navigation on failure.

- [ ] **P8 Crafted rules/positioning file can pollute `Object.prototype`** (confirmed)
  - **Where:** `useProjectLoad.ts` ~252–257.
  - **Problem:** `gsub: "__proto__"` sets `Object.prototype.liga = {}`, which corrupts state app-wide or crashes it. No XSS.
  - **Fix:** reject `__proto__`/`constructor`/`prototype` keys, or use `Object.create(null)`/Maps. Schema-validate imported files.

- [ ] **P9 Guide font changed in Settings isn't saved** (confirmed)
  - **Where:** `useProjectPersistence.ts` (`getProjectState` uses `script.guideFont`); `components/SettingsPage.tsx` 60.
  - **Fix:** save `guideFont` from ProjectContext, and add it to the dirty deps.

- [ ] **P10 "Include Latin" ignored for a new empty project** (confirmed)
  - **Where:** `ScriptSelection.tsx` ~515; `useProjectLoad.ts` 75, ~165.
  - **Problem:** `characterSets: []` is truthy, so the project starts with zero glyphs.
  - **Fix:** omit the field, or test `?.length`.

- [ ] **P11 Status filters go stale after drawing** (confirmed)
  - **Where:** `hooks/useGlyphFilter.ts` 123.
  - **Problem:** the memo depends on `glyphDataMap`, which is mutated in place, and not on `glyphVersion`.
  - **Fix:** add `glyphVersion`.

- [ ] **P12 One failed translation fetch blanks the whole app** (confirmed)
  - **Where:** `contexts/LocaleContext.tsx` 55–59, 138.
  - **Problem:** if any locale fails to load (offline, 5xx), `translations` stays null and the provider renders null.
  - **Fix:** use `Promise.allSettled` with `{}` per locale, or show an error state.

- [ ] **P13 Undo of delete and bulk operations reverts later edits** (confirmed by reading)
  - **Where:** `handleDeleteGlyph` and the bulk operations in `useGlyphActions.ts` / `useBatchOperations.ts`.
  - **Problem:** they restore whole-map snapshots.
  - **Fix:** undo only the affected entries.

- [ ] **P14 Guide-font name/URL interpolated into `<style>`** (confirmed; low)
  - **Where:** `App.tsx` ~287; `ScriptSelection.tsx` ~215.
  - **Problem:** this allows CSS injection or external loads from project or script files. Scripts can't run.
  - **Fix:** validate or escape the values, or use the `FontFace` API.

---

## R: Rules UI

- [ ] **R1 ⚠ A dist rule with an unknown glyph white-screens the app** (confirmed)
  - **Where:** `components/rules/DistRulesEditor.tsx` 358, 380, 385, 388.
  - **Problem:** `allCharsByName.get(name)!` is passed to `GlyphTile`. There is no ErrorBoundary anywhere, so the whole tree unmounts every time the dist tab opens. Deleting or renaming a referenced glyph does the same.
  - **Fix:** render a placeholder when the lookup misses, validate on save, and add a top-level ErrorBoundary.

- [ ] **R2 ⚠ Saving a rule silently overwrites another rule with the same output** (confirmed)
  - **Where:** `hooks/useRulesState.ts` (handleSaveNewRule/handleUpdateRule).
  - **Problem:** rules are keyed by their output glyph, so a second contextual rule producing the same replacement replaces the first. Editing a rule's output to an existing name deletes that rule.
  - **Fix:** warn or block on collision. Longer term, store rules as arrays.

- [ ] **R3 Renaming a group marks every group as a positioning group** (confirmed)
  - **Where:** `hooks/useRefactoring.ts` 47.
  - **Problem:** `setPositioningGroupNames(new Set(Object.keys(newState.groups)))`. After one rename every group shows the lock icon, and the groups appear in the Positioning Rules modal, where deleting them removes them globally.
  - **Fix:** only add or remove the renamed key.
  - (The "rename discards unsaved local edits" part is gone now that rule edits are committed immediately.)

- [ ] **R4 Renaming a character-set header pre-fills the translated label and can break export** (confirmed)
  - **Where:** `components/CharacterGrid.tsx` 124–138; `components/DrawingWorkspace.tsx` 358–363.
  - **Problem:** pressing Enter without changes renames `vowels` to its translated label (e.g. `உயிரெழுத்துக்கள்`), which sanitizes to `@` and breaks FEA (see E5).
  - **Fix:** pre-fill `nameKey`, skip unchanged renames, and sanitize with a uniqueness check.

- [ ] **R5 Positioning rule editor adds one tag per keystroke** (confirmed)
  - **Where:** `components/rules/manager/RuleManager.tsx` 216, 225.
  - **Problem:** `<SmartGlyphInput value="" onChange={v => addTag(...)}>`, so typing `$cons` adds `$`, `c`, `o`… and the dropdown never filters.
  - **Fix:** keep local input state, and add a tag on select/Enter.

- [ ] **R6 Positioning rule add/edit overwrites the wrong rule** (confirmed)
  - **Where:** `RuleManager.tsx` 398–408, 460, 468.
  - **Problem:** `!editingIndex` treats index 0 as falsy, so adding a rule while editing #1 overwrites #1. The editing `RuleEditor` has no `key`, so switching rules keeps the old form values.
  - **Fix:** use `editingIndex === null`, and set `key={editingIndex}`.

- [ ] **R7 Positioning group manager accepts empty names; renames don't refactor** (confirmed)
  - **Where:** `components/rules/manager/GroupManager.tsx` 273, 289, 325.
  - **Problem:** `groups['']` generates `@ = [...]`. Renaming `$foo` leaves stale references in rules and anchors.
  - **Fix:** require a non-empty sanitized name, and use `renameGroupInState`.

- [ ] **R8 Lookups pane: shared add state, silent validation** (confirmed)
  - **Where:** `components/rules/LookupsPane.tsx` 38, 78, 99, 119.
  - **Problem:** "Add Single Rule" opens in every lookup at once, and validation errors go to a no-op `showNotification`.
  - **Fix:** store `{lookupKey, type}`, and pass the real notifier.

- [ ] **R9 "Add Lookup" does nothing on an implied feature** (confirmed)
  - **Where:** `components/RulesPage.tsx` 541–560; `useRulesState.ts` (handleAddLookupReference).
  - **Fix:** create the feature, seeded with `inline` + `auto_generated`, before adding the reference.

- [ ] **R10 Typed but unconfirmed glyph is lost on Save** (confirmed)
  - **Where:** `components/RuleEditor.tsx` 225–249; `DistRulesEditor.tsx` 209–232.
  - **Problem:** `onBlur` clears `addValue` before Save runs.
  - **Fix:** commit a non-empty `addValue` on blur.

- [ ] **R11 Command palette search can clear while typing** (likely)
  - **Where:** `components/AppHeader.tsx` 121, 320; `components/CommandPalette.tsx` 175–178.
  - **Problem:** `handleCommandAction` is recreated on every render and is a dependency of the effect that calls `setSearchTerm('')`.
  - **Fix:** wrap it in `useCallback`, or rebuild the index only when the palette opens.

- [ ] **R12 `GlyphTile` reads a field the rules context doesn't have** (confirmed; TS2339)
  - **Where:** `components/GlyphTile.tsx` 35.
  - **Problem:** `const { groups } = useRules()` is always undefined, so `$groups` are ignored for positioned tiles.
  - **Fix:** use `state.fontRules?.groups`.

---

## U: UX, text and i18n

- ~~**U1 No way to switch between Simple and Advanced mode**~~: withdrawn. The modes were dropped on purpose in favour of progressive disclosure. The leftover code is listed under T4.

- [ ] **U2 Raw i18n keys shown to users** (confirmed)
  - **Problem:**
    - `scriptHebrew` and `scriptTutorial` are missing from `en.json` (home-screen tiles).
    - Missing set `nameKey`s: `archaicLetters` (Tamil), `basicCyrillic`, `specialCyrillic`, `consonantsTemplate` (Kannada/Telugu), `ottu`, `LatinIndicLetters`, `mini_marks`, `letters`, `others`.
    - Script cards for Tutorial, Gurmukhi and Latin (Indic) show "s" as their icon (`ScriptSelection.tsx` ~789 falls back to `nameKey[0]`).

- [ ] **U3 Tamil tutorial has 15 missing keys with no English fallback** (confirmed)
  - **Where:** `locales/tutorial/ta.json`; `components/TutorialManager.tsx`.
  - **Problem:** keys such as `relinkExpl`, `kerningNav`, `compositeTools` and `hintKerning*` are missing. Those steps render empty tooltips, and some have `hideFooter: true`.
  - **Fix:** fall back to English per key, and add the keys.

- [ ] **U4 Locale gaps in `ta.json`** (confirmed)
  - **Problem:** 15 keys are missing (they fall back to English, e.g. `copySelection`, `pasteSelection`, `ignorePair`). Three placeholder mismatches: `linkedGlyphLocked` drops `{components}`, `mismatchedScriptError` drops `{currentScript}`, and `mismatchedScriptMessage` drops both.

- [ ] **U5 Tour and hint text shows raw markdown** (e.g. `**Pen Tool**`) (confirmed in the browser)

- [ ] **U6 The drawing tour reappears when a second glyph is opened and blocks the canvas** (confirmed in the browser)

- [ ] **U7 The "Create" (Creator Studio) button shows the "tasks incomplete… export anyway?" warning** (confirmed in the browser)

- [ ] **U8 Imported-font glyphs are labelled `U+0041` instead of their characters** (confirmed in the browser)

- [ ] **U9 The feature-error dialog text is cut off** (confirmed in the browser)

- [ ] **U10 The Positioning tab says "No mark characters have been drawn" when the marks are linked glyphs** (confirmed in the browser: Tutorial script, `ͤ` with `link: ["e"]`)

- [ ] **U11 The header ⋮ (More) button has no accessible name** (confirmed)

- [ ] **U12 Switching locale doesn't refresh some memoized lists** (confirmed by reading)
  - **Where:** `LocaleContext.tsx` (`t` has empty deps), e.g. `SmartGlyphInput` options.

---

## S: Script data

- [ ] **S1 Sinhala: 120 `akhn` ligature outputs aren't defined as glyphs** (e.g. `ක්‍රි`, `ක්‍ර්`), plus 120 group members. Those rules are silently skipped at export.
- [ ] **S2 Kannada:**
  - the `symbols` set has glyphs named `"0"`–`"9"` (resolving to ASCII and duplicating `characters_basic`) and Telugu fraction signs U+0C77–0C7F;
  - the `ಢಾ` composite uses Telugu `ా` (U+0C3E);
  - groups `$ottuR`/`$ottuAi` are undefined, as are PUA glyphs U+E02D, U+E02F–E032 and U+E039;
  - the `ಕ್ಷೀ` ligature output is undefined.
- [ ] **S3 Devanagari:** the `ई` composite references an undefined U+1CE0 (a Vedic tone mark).
- [ ] **S4 Tamil:** `liga: ["ன","ூா"]` has a two-character component (typo).
- [ ] **S5 Telugu:** `ళు` and `ళూ` are in the `consLeft` group but are undefined.
- [ ] **S6 Missing or broken files:**
  - `data/rule_german.json` is 0 bytes and misnamed;
  - `rules_hebrew`, `rules_german`, `positioning_latin` (Latin logs a JSON parse error), `sample_lao` and `sample_tutorial` don't exist;
  - the tutorial's curated `sampleText` from `scripts.json` is thrown away when the `.txt` fetch returns HTML (`useProjectLoad.ts` ~305).
- [ ] **S7 Guide fonts:** the Noto Greek/Cyrillic URLs return 404/403 on every landing load (`scripts.json` ~773, ~817). Gurmukhi's guide font is Noto Sans Devanagari. The jsDelivr `gh/` URLs have no `@ref`, so they track the default branch.
- [ ] **S8 `data/characters_custom.json` isn't referenced by any script.**

---

## T: Tooling and housekeeping

- [ ] **T1 Tests:**
  - `vitest` is in `dependencies` (move it to `devDependencies`);
  - there's no `test` script, though TESTING.md documents `npm run test`;
  - `utils/vectorUtils.test.ts` fails on `-0` vs `+0`;
  - `contexts/RulesContext.test.ts` tests a copy of the reducer, not the real one.
- [ ] **T2 Lint fails with 340 errors** (mostly unused vars and prefer-const). `eslint-plugin-react-hooks` is installed but not enabled. `globals` is imported by the config but not declared.
- [ ] **T3 `tsc --noEmit` reports 43 errors, and there's no typecheck step or CI.** Notable ones:
  - `components/DrawingModal.tsx:16` imports a nonexistent `useSliceTool`;
  - the PositioningEditorPage/Workspace import paths are wrong;
  - the `importFont` modal key is missing from the type;
  - `openPalette` is missing from `LayoutContextType`.
- [ ] **T4 Dead code:**
  - the stale root `DrawingModal.tsx` (21 of the tsc errors) and root `LayoutContext.tsx`;
  - the unused `contexts/EditorContext.tsx` and `workers/cascadeWorker.ts` (incompatible protocol);
  - duplicate `ProjectContext` fields that are never set (`GlyphTile` reads `metrics` from it and gets null);
  - the `GEMINI_API_KEY` define in `vite.config.ts`;
  - the "characterss" typo in `metadata.json`;
  - leftovers from the removed Simple/Advanced modes (replaced by progressive disclosure):
    - `handleEditorModeChange` (`hooks/useAppActions.ts` 175) is still passed through `App` → `AppHeader`/`UnifiedEditorModal`/`DrawingModal`, but nothing calls it;
    - the `advancedMode`/`simpleMode` locale keys are unused;
    - `data/test_cases.json` still has 66 "ADVANCED:" QA cases;
    - `settings.editorMode` is still read, only to choose between the "Kerning" and "Spacing" labels (`AppHeader`, `KerningWorkspace`, `KerningEditorHeader`, `IncompleteFontWarningModal`). Built-in scripts default to `simple` and custom scripts to `advanced`. Consider replacing it with `preferKerningTerm` alone.
- [ ] **T5 One-off scripts in the repo root:** `gen_chars.cjs`, `test_unicode*.cjs` and `patch_locales.cjs` (already applied). `generate_malayalam_traditional_v2.cjs` overwrites hand-edited data. `check_translations.js` fails in ESM. `data/add_liga.js` and `data/remove_gsub.js` are broken. `scripts/fetchIndicCategories.ts` mixes UCD 16 and 17.
- [ ] **T6 Build:**
  - the main chunk is 1.9 MB (code-split it);
  - a stray `[file:line]` Tailwind class causes a build warning;
  - the `/vite.svg` favicon returns 404.
- [ ] **T7 `npm audit` reports 27 vulnerabilities** (1 critical, 11 high), not yet assessed. Many may be in dev-only packages.
- [ ] **T8 No version pin for npm** (`packageManager`/`engines`), so lockfile flags change between npm versions.
