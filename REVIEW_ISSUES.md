# Code review: open issues

Findings from the full code and functionality review (November 2026) that are **not** covered by the eight release-blocker fixes on the `claude` branch (commit `d7b04c8`).

Each issue has a stable ID, such as `E1`, so we can work through them one at a time. Tick the box when an issue is fixed and note the commit next to it.

Issues are split into **Functional** (a user can see or hit them) and **Technical** (code health only: tests, lint, types, build, dependencies, dead code, speed, security hardening). IDs keep their original area letter, so a technical item such as `K11` is still `K11`.

**Legend**
- **Priority:** ⚠ = fix next (users hit it quickly, or it damages the font or user data); otherwise normal.
- **Confidence:** *confirmed* = reproduced by a script or in the browser, or traced end to end in the code; *likely* = clear from the code but not executed.
- **Line numbers** are from the review snapshot and may have drifted since.

**Already fixed on `claude`:** production export (minified worker), build missing data/locales, Devanagari crash, file-load project-ID clash, edits lost on close, rules edits lost, composite/linked glyphs missing from export, canvas-vs-font units for bearings and kerning. Uncaught export errors (spinner stuck) were fixed along with these.


**Found while fixing the type errors, now fixed:**
- **Help crashed in "Supported scripts".** `HelpPage` maps over `scripts`, but `AppContainer` never passed them.
- **"Merge imported font" added characters but no drawings.** Saved glyphs are `[unicode, data]` pairs; `mergeFontIntoProject` read `g.unicode` (always undefined), so every glyph looked "already present".
- **The Command button in the phone nav drawer threw an error.** It called `layout.openPalette`, which didn't exist; the palette state now lives in `LayoutContext`, shared with the header and Ctrl+K.
- **Duplicate React key in the Spacing editor** for pairs that use the same glyph twice (e.g. ं + ं): the Sources strip listed it twice. It's now listed once.

---

# Functional issues

A user can see or hit these. All ⚠ items are here.

## E: Font export and import

- [x] **E1 ⚠ Pyodide init failure hangs export and import forever** (confirmed)
  - **Where:** `services/pythonFontService.ts` ~413–516.
  - **Problem:** `init_error` and `worker.onerror` never reject `pyodideReadyPromise`, and `worker` is never reset. If the CDN or PyPI fails (e.g. offline, or `micropip.install('fontFeatures')` fails), every `compileFeaturesAndPatch`, `patchFont` and `extractFea` awaits forever. `ImportFontModal` awaits `extractFea` with its close button disabled, so the dialog can't be dismissed. If the worker crashes after it was ready, later requests go to a dead worker.
  - **Fix:** keep the reject function and reject on `init_error`/`onerror`; null out `worker` so it can restart; add a per-request timeout.
  - **Fixed:** the worker is torn down on `init_error`, `onerror` or a 5-minute timeout: waiting requests fail with a clear message ("The font compiler could not start… Check your internet connection and try again") and the next export starts a fresh worker. Checked in the browser with the Pyodide/PyPI downloads blocked: the old build was still spinning after 40 s and couldn't export again; now the error appears in about 7 s, and exporting works once the network is back.

- [x] **E2 ⚠ Imported fonts come back rescaled and shifted** (confirmed)
  - **Where:** `services/importFontService.ts` 47–61, 129–136 vs `services/fontBuilder.ts` (outline transform).
  - **Problem:** import maps glyph y to canvas `600 - y`; export maps canvas to `(1000 - y)·(asc - desc)/1000 + desc`. These only cancel out when asc - desc = 1000 and desc = -400. Test: UPM 1000, hhea 900/-300. Glyph `A` [50,0,550,700] came back as [50,180,650,1020], 1.2× larger and raised 180 units, with its advance changed from 600 to 700.
  - **Fix:** derive the import mapping from the same formula as export: `y_canvas = 1000 - (y - desc)/k`.
  - **Fixed:** import is now the exact inverse of the export transform (k = (asc − desc)/canvas; baseline/top line derived from it), and bearings are converted to canvas units; the left bearing is taken from the outline's left edge. Checked in the browser with a test font (UPM 1000, asc 900, desc −300): `A` [50,0,550,700] adv 600 came back as [0,180,600,1020] adv 1320 on the old build, and [50,0,550,700] adv 600 now (`g` within 1 unit).

- [ ] **E3 ⚠ Edit mode forces UPM to 1000 but keeps the base font's GPOS units** (confirmed by reading)
  - **Where:** `importFontService.ts` 47–51; `pythonFontService.ts` 178–213.
  - **Problem:** outlines and `head` are rescaled to 1000 UPM, while `patch_font` keeps the base font's GSUB/GPOS/GDEF values in their original units. Editing a 2048-UPM font makes all kerning and anchors about 2× too large.
  - **Fix:** in edit mode keep the original UPM at scale 1, or scale GPOS on patch (e.g. `fontTools.ttLib.scaleUpem`).

- [x] **E4 ⚠ Edit-mode `patch_font` can crash or corrupt the cmap** (confirmed)
  - **Where:** `pythonFontService.ts` 180, 192–205.
  - **Problem:** hmtx and cmap are replaced wholesale from the delta font, but the base glyph order is kept.
    - A base glyph missing from the delta causes `KeyError` on save. Example: the base names ZWJ `zwj`, but the delta emits `uni200D`.
    - Secondary code points are lost (e.g. `space` serving both U+0020 and U+00A0).
    - PUA code points assigned on import leak into the cmap.
  - **Fix:** merge per glyph name into the base hmtx and cmap, and skip PUA code points that came from `isPuaAssigned`.
  - **Fixed:** `glyf` (TrueType) and `hmtx` are merged per glyph name into the base instead of being replaced, and the cmap is merged into the base's (secondary code points kept; PUA codes not already in the base left out; a format-12 table is added if needed). Checked with fontTools on Andale Mono and a CFF delta missing some glyphs: the old code failed with `KeyError 'exclam'`; now it patches, keeps untouched glyphs, keeps U+00B7/U+2219 on one glyph, and no PUA code leaks. (E3, the UPM mismatch, is still open.)

- [ ] **E5 ⚠ FEA class-name sanitising breaks or silently changes features** (confirmed with feaLib)
  - **Where:** `services/feaService.ts` 14, 425, 442.
  - **Problem:** `sanitizeIdentifier` strips non-ASCII characters and doesn't de-duplicate.
    - A group named `உயிர்` emits `@ = [...]`. feaLib fails, and the font ships with no GSUB or GPOS.
    - A user group named like a character set (e.g. `consonants`) is emitted twice, and the set's definition wins.
  - **Fix:** map names to unique ASCII identifiers (e.g. with a hash suffix), namespace character-set classes, and keep names to 63 characters or fewer.

- [x] **E6 ⚠ Lookup flags produce invalid or partial FEA** (confirmed)
  - **Where:** `feaService.ts` 642–648, 732–737, 753–758.
  - **Problem:** each flag is emitted as `lookupflag ${name} ${value};`.
    - The documented `{"IgnoreMarks":"true"}` (rules_json.md:225) becomes `lookupflag IgnoreMarks true;`, which feaLib rejects. That kills all features.
    - Several flags become separate statements, and only the last applies.
  - **Fix:** emit one `lookupflag A B UseMarkFilteringSet @x;` statement, treat boolean values as bare flag names, and map `$group` to `@group`.
  - **Fixed:** one `lookupflag` statement per lookup (`formatLookupFlags` in `services/feaService.ts`, tested): boolean flags become bare names, `$group`/`@group` become `@group`, unknown flags are skipped. Checked with feaLib: the old `lookupflag IgnoreMarks true;` is rejected, the new forms compile. The shipped Kannada/Telugu `UseMarkFilteringSet @virama` output is unchanged (Kannada export identical apart from the `head` timestamp). The Rules screens show the same text.

- [x] **E7 Zero-width marks get wrong advances and anchors** (confirmed)
  - **Where:** `fontBuilder.ts` (zero-advance branch); `feaService.ts` ~857.
  - **Problem:**
    - `advWidth: 0` is honoured only when `glyphClass === 'mark'`. Devanagari `ं` (base, advWidth 0) is exported with advance = bbox + RSB, so a gap appears after every "कं".
    - Imported non-spacing marks are shifted to xMin=0, which breaks base GPOS anchors in edit mode.
    - mkmk anchors add the base's LSB even when the base is a zero-width mark.
  - **Fix:** gate the zero-advance rule on `advWidth === 0` alone, don't re-shift imported outlines, and use LSB 0 for zero-advance bases.
  - **Partly fixed (data):** the first bullet was a data slip, not a code problem. In `data/characters_devanagari.json`, `ं` (U+0902) was `glyphClass: "base"` with `advWidth: 0`, while its neighbour `ँ` is a `mark`, Unicode calls it a non-spacing mark, and the positioning rules use it as a mark. It is now a `mark`. Export check (क + ं): advance 414 → 0, GDEF class base → mark, mark positioning (GPOS type 4) unchanged. A scan of all scripts found no other non-spacing mark classed as base except Malayalam `ു ൂ ൃ ൄ`, which look deliberate (spacing in reformed orthography), so they were left alone.
  - **Fixed (code):**
    - Edit mode no longer moves zero-width marks to x = 0, so the original font's GPOS anchors still fit (import now reproduces the original coordinates, E2). Checked with a test font whose grave is drawn at x −300..−100 with a GPOS anchor: rendered with HarfBuzz, the old build put the grave at 450..650 over an `a` at 50..450; now it is at 150..350, as in the original.
    - GPOS anchors use one formula (`computeMarkAnchorX`, tested): the base's left edge is 0 for a zero-width mark (mark-to-mark no longer adds its LSB), and a spacing mark's own LSB is subtracted. Unchanged for the common case (base + zero-width mark): a Devanagari export with marks is identical apart from the `head` timestamp.
    - Found while testing: edit-mode patching left every hmtx LSB at 0 (opentype.js writes 0), while TrueType rasterizers can position glyphs by it. `patch_font` now sets each LSB to the outline's left edge (a = 50, grave = −300 in the test font).

- [x] **E8 Newer Indic script tags are missing** (confirmed by reading)
  - **Where:** `data/indicScripts.json`; `feaService.ts` 176–177, 232–233.
  - **Problem:** `dev2`, `knd2` and `gur2` (and `bng2`, `gjr2`, `ory2`) are missing, though the shipped rules use dev2, knd2 and gur2. User-defined ligatures in those scripts go into `liga` instead of akhn/blws/psts, which Windows Indic shaping doesn't apply.
  - **Fix:** add the v2 tags.
  - **Fixed:** `dev2`, `bng2`, `gur2`, `gjr2`, `ory2` and `knd2` added to `data/indicScripts.json`. A user-added ligature without a feature in a Hindi, Kannada or Punjabi project now goes into the Indic features (tested: `services/feaIndicTags.test.ts`; it fails on the old list). Built-in projects export unchanged: Tamil and Devanagari (with GSUB and GPOS) differ only in the `head` timestamp.

- [x] **E9 Blank glyphs get the default 800-unit advance** (confirmed by reading)
  - **Where:** `fontBuilder.ts` (advance-width block); `importFontService.ts` 54.
  - **Problem:** undrawn Zs/Cf/Cc glyphs (NBSP, thin space, ZWSP…) get `defaultAdvanceWidth`. In edit mode this overwrites the base font's widths. The imported `char.advWidth` is never used.
  - **Fix:** use `char.advWidth` when set; otherwise 0 for Cf characters and the space width for Zs.
  - **Fixed:** undrawn glyphs use `getBlankAdvanceWidth` (`utils/glyphUtils.ts`, tested): a width stored on the character (e.g. from an imported font) wins; format and control characters get 0 (tab and CR get the space width); spaces get their usual em fraction (em space 1000, thin 200, hair 100…) or the space width. Exporting a General Punctuation project: 38 blank characters went from 800 to their proper widths; the drawn glyph, space, ZWJ and ZWNJ are unchanged.

- [ ] **E10 Kerning only in `dist`, under a single `languagesystem`** (likely; depends on the renderer)
  - **Where:** `feaService.ts` ~318, ~899, ~946.
  - **Problem:** there's no `kern` feature and no `languagesystem DFLT dflt;`. Latin projects may lose kerning in apps that only apply `kern`, and Latin digits and punctuation in Indic fonts get no positioning.
  - **Fix:** emit pairs in `kern` for non-Indic scripts, and add DFLT.

---

## D: Drawing and editing

- [x] **D1 ⚠ Image tracer breaks paper.js for the rest of the session** (confirmed)
  - **Where:** `services/imageTracerService.ts` 106–107, 177–180.
  - **Problem:** `new paper.PaperScope().setup(canvas)` makes the tracer's scope the global active `paper`, and `scope.remove()` never switches back. Afterwards every `new paperScope.Path(...)` on the main thread throws `Cannot read properties of null (reading '_currentStyle')`. That breaks "insert as vector", outline bounding boxes during render, hover hit-testing, slice and edit double-click.
  - **Fix:** in `finally`, call `scope.remove()` and then `paperScope.activate()`, or reuse the shared scope with `project.clear()`.
  - **Fixed:** after the tracer removes its paper.js scope it re-activates the app's shared scope. Checked in the browser: on the old build, Insert after tracing failed (`Cannot read properties of null (reading 'getSize')`) and the dialog stayed open; now it inserts with no errors.

- [x] **D2 Image tracer output clipped to 300×150** (confirmed)
  - **Where:** `imageTracerService.ts` 104–107, 132–147.
  - **Problem:** the result is inverted against `scope.view.bounds`, which for a detached canvas is the default 300×150, and then the "first subpath" is dropped. A 1000×1000 image traces to a frame rectangle. Large images are also traced at full resolution on the main thread, on every slider change.
  - **Fix:** invert against the image bounds, pick the frame by its bounds rather than its position, and downscale before tracing.
  - **Fixed:** the trace is inverted against the image's own size (not the 300×150 default view), the outer frame is dropped by its bounds, images over 1200 px are scaled down first, and the preview SVG now fits its box (it used to overflow and cover the Insert button). Checked in the browser with a 1000×1000 image of an L: the old build previewed a 300×150 frame; now the L's outline is previewed and inserted.

- [x] **D3 ⚠ Undo history wiped after every autosave** (confirmed by reading)
  - **Where:** `hooks/drawing/useGlyphEditSession.ts` 112–122.
  - **Problem:** the effect depends on `[activeEditorForceUpdate, glyphData]`, and the global counter never resets. After any batch operation touches the open glyph, every autosave resets `currentPaths` and the history (so undo is lost about 500 ms after each edit), can drop an in-progress stroke, and replaces regenerated composite paths with stale stored ones.
  - **Fix:** keep the last-handled counter in a ref, and reload only when it increments.
  - **Fixed:** the open glyph reloads only when a new bulk operation signals it (the last handled counter is kept in a ref), not on every save, so autosave no longer wipes undo or drops a stroke in progress. Not checked in the browser.

- [x] **D4 ⚠ Dragging a newly clicked path moves the previously selected component** (confirmed by reading)
  - **Where:** `hooks/drawingTools/useSelectTool.ts` 168–184, 292–303, 345.
  - **Problem:** `activeComponentIndex` is set from the old selection and isn't cleared when the click selects a different path. The guard at ~566 is dead code.
  - **Fix:** reset it at the start of `start()`, and set it only once the final target is known.
  - **Fixed:** the component to drag is decided only once the click's target is known (reset at the start of every click; taken from the handle/selection being dragged or the newly clicked shapes). Not checked in the browser.

- [x] **D5 Transforming a component in a composite discards other edits** (confirmed by reading)
  - **Where:** `useGlyphEditSession.ts` 133–177.
  - **Problem:** `'move'` regenerates the whole glyph with `generateCompositeGlyphData`, dropping extra strokes and manual point edits and invalidating selection IDs. Paths with `component-N` group IDs on a glyph with neither `link` nor `composite` can't be moved at all.
  - **Fix:** transform only the `component-i` paths, and intercept only when `link` or `composite` is set.
  - **Fixed:** a component drag replaces only that component's shapes (regenerated without re-centring and placed where it sat at the start of the drag); other components, extra strokes and hand edits are kept, and selection survives. Glyphs without `link`/`composite` now move `component-N` shapes like ordinary shapes. Not confirmed in the browser: the automated drag didn't grab the component.

- [x] **D6 Double-click to add a point on an outline does nothing** (confirmed)
  - **Where:** `hooks/drawingTools/useEditTool.ts` 221, 259–264.
  - **Problem:** the location comes from one `paper.Path`, but `divideAt` is called on a different path, so it returns null. An unchanged history entry is still pushed.
  - **Fix:** `paperPath.curves[location.index].divideAtTime(location.time)`.
  - **Fixed:** the click location is split on the matching curve of the copied path (`curves[index].divideAtTime(time)`); nothing is pushed to history if no split happens. Checked with paper.js: the old call returned null, the new one adds the point.

- [x] **D7 Slice and eraser damage outlines and change stroke types** (confirmed by reading)
  - **Where:** `hooks/drawingTools/useSliceTool.ts` 66–98; `useEraserTool.ts` 141.
  - **Problem:**
    - Outline slicing uses only `segmentGroups[0]` and drops handles, so counters vanish and curves become chords.
    - Pieces come back as open `pen` strokes. Pen strokes are flattened with paper's `smooth()`, not the app's B-spline, so they bulge.
    - A `line` is treated as closed.
    - Eraser fragments are forced to `pen`.
  - **Fix:** use boolean operations for outlines (keeping type and handles), flatten with the app's `curveToPolyline`, and keep the original type and angle on fragments.
  - **Fixed:** outlines are cut with paper.js boolean operations along the slice line (all contours, handles kept) into two closed outline pieces; pen/calligraphy strokes are flattened with the app's own curve instead of paper's `smooth()`; lines are no longer treated as closed; slice and eraser pieces keep calligraphy type and angle, and a line stays a line. Checked in the browser on a traced outline: old build gave two open pen strokes, now two closed outlines.

- [x] **D8 Undo/redo doesn't restore `compositeTransform`** (confirmed by reading)
  - **Where:** `useGlyphEditSession.ts` 409–460.
  - **Problem:** after undoing a linked-component move, the paths revert but the transform stays moved and is saved.
  - **Fix:** store `{paths, compositeTransform}` in each history entry.
  - **Fixed:** each undo step stores `{paths, compositeTransform}`, and undo/redo restore both. Checked in the browser with the linked கி: after moving ி and pressing Undo, the old build kept the moved transform; now it goes back.

- [x] **D9 Middle-button pan gets stuck on tools other than pan** (confirmed by reading)
  - **Where:** `hooks/useDrawingCanvas.ts` 343–364.
  - **Problem:** `endInteraction` only ends the pan when `tool === 'pan'`.
  - **Fix:** call `panTool.end()` whenever a pan is active.
  - **Fixed:** a pan now ends whichever tool is active (also fixes lifting one finger after a pinch).

- [x] **D10 Dots can't be clicked or hovered** (confirmed by reading)
  - **Where:** `useDrawingCanvas.ts` 237–246.
  - **Problem:** a 1-point dot has no segments to hit-test.
  - **Fix:** special-case dots: hit when the distance to the centre is at most radius + tolerance.
  - **Fixed:** dots are hit-tested as a disc (radius + the usual tolerance); helpers in `utils/geometryUtils.ts`, tested.

- [x] **D11 Backspace in a text field deletes the selected point** (confirmed by reading)
  - **Where:** `useEditTool.ts` 52–110.
  - **Problem:** the window keydown listener has no input/textarea guard, unlike `useDrawingShortcuts`.
  - **Fix:** add the same target guard.
  - **Fixed:** the edit tool ignores keys typed in inputs, textareas, selects and editable text (`utils/domUtils.ts`, tested). `useDrawingShortcuts` still has its own older guard, which doesn't cover editable text.

- [x] **D12 Pasted copies join the original's group** (confirmed by reading)
  - **Where:** `hooks/drawing/useCanvasOperations.ts` 50–57.
  - **Problem:** paste keeps the `groupId`, so the original and the copy are selected together. A pasted `component-N` group triggers D5.
  - **Fix:** give each pasted group a fresh ID.
  - **Fixed:** pasted shapes get fresh group IDs (shapes grouped together stay grouped with each other); checked in the browser.

- [x] **D13 Name-matched glyph import can duplicate a unicode** (confirmed by reading)
  - **Where:** `components/ImportGlyphsModal.tsx` 236–245, 346–357.
  - **Problem:** a "new" character keeps the source unicode without checking the target. That gives two characters on one code point, an uncounted overwrite, and colliding selection state.
  - **Fix:** if the unicode is already taken, assign a PUA code point.
  - **Fixed:** after matching, any new character whose code point is already used in the project (or by another row) moves to a free private-use code point, so rows and characters never share one.

- [x] **D14 Trackpad pinch and ctrl+wheel also zoom the page** (confirmed)
  - **Where:** `useDrawingCanvas.ts` 456–457; the same in `hooks/useKerningCanvas.ts` 128–144.
  - **Problem:** React's `onWheel` is passive, so `preventDefault()` is ignored.
  - **Fix:** attach a native `wheel` listener with `{passive: false}`.
  - **Fixed:** native non-passive wheel listener (`hooks/useNonPassiveWheel.ts`) on the drawing, spacing and positioning canvases; checked in the browser that Ctrl+wheel no longer reaches the page. Safari reports trackpad pinch as gesture events, which this doesn't cover.

---

## K: Kerning and positioning

- [x] **K1 ⚠ Kerning editor tracks the pair by list index, so edits can land on the wrong pair** (confirmed swap; likely write)
  - **Where:** `components/KerningPage.tsx` 307–312, 326–336.
  - **Problem:** under the incomplete/toBeReviewed filters (or in Spaced after Reset), saving drops the pair from the list, and `editingIndex` silently points at the next pair. If an autosave fires mid-drag, the rest of the drag is written to the new pair.
  - **Fix:** store the pair key (`"L-R"`), not an index.
  - **Fixed:** the open pair is tracked by its glyphs, not its list position; if saving filters it out of the list it stays open, and Previous/Next go to its old neighbours. Not checked in the browser.

- [x] **K2 ⚠ Kerning Next/Previous/Back skip the unsaved-changes check** (confirmed)
  - **Where:** `components/kerning/KerningEditorHeader.tsx` 137, 147, 160; `hooks/kerning/useKerningSession.ts` 171–182.
  - **Problem:** in manual mode, edits are discarded without a prompt. In autosave mode, navigating within 800 ms loses the last change.
  - **Fix:** route these buttons through `handleNavigationAttempt`, and flush the pending timer on navigation instead of clearing it.
  - **Fixed:** Back, Previous/Next and the glyph strip go through one guard, like the drawing and positioning editors: with autosave the edit is saved first (no 800 ms gap); in manual mode the Unsaved Changes dialog asks (Save & Close / Discard / Cancel). Checked in the browser; the old build failed both cases.

- [x] **K3 ⚠ Two `calculateDefaultMarkOffset` implementations disagree** (confirmed)
  - **Where:** `services/positioningHeuristicsService.ts` 113 vs `services/glyphRenderService.ts` 293.
  - **Problem:** with no `markAttachment` rule:
    - The editor, grid preview and export use the heuristics version, which places the mark side by side.
    - Confirm, accept-all, the cascades and FEA use the other version, which gives (0,0) for zero-width marks.
    - Example: ka+u shows an offset of (600,0) but saves (0,0), so the mark jumps. The class cascade then applies +600 to its siblings.
  - **Fix:** keep one implementation and route every caller through it.
  - **Fixed:** one implementation (`positioningHeuristicsService`, the one the editor shows); `glyphRenderService` re-exports it, so Confirm, Accept All, the cascades and the FEA match the editor (author's choice). The cascade worker's copy already matched. Devanagari and Tamil exports unchanged (their marks have attachment rules); it changes the output only for zero-width marks without a rule.

- [x] **K4 Background auto-kern uses the glyph from before the save** (confirmed)
  - **Where:** `contexts/KerningContext.tsx` 146–206, triggered from `useGlyphActions.ts` 589–599.
  - **Problem:** `processQueue` closes over the `glyphDataMap` from before the save, and queued pairs carry the old bearings. Suggestions always lag one save behind.
  - **Fix:** read the maps through refs, queue unicodes, and resolve bearings when the batch is built.
  - **Fixed:** batches read the latest glyph map and bearings when they are built (refs), not the ones captured when the save queued them. Not checked in the browser.

- [x] **K5 Recommended-kerning targets resolved wrongly** (confirmed)
  - **Where:** `services/kerningService.ts` 99–114; worker path `useGlyphActions.ts` 507–511.
  - **Problem:** `null` becomes 0 ("kern until touching") instead of the default. Group rules (`$caps`) never match. The worker and main-thread paths treat `'lsb'`/`'rsb'` differently.
  - **Fix:** treat null as the default, resolve rules with `expandMembers` (exact pair before group), and share one resolver.
  - **Fixed:** one shared reader (`resolveRecommendedTarget`, tested) for the Auto-kern button and the background auto-kern: null/missing = default gap, 0 = touching, `'lsb'`/`'rsb'` = bearings, exact pair before `$group` rules (groups now match).

- [x] **K6 Auto-Kern replaces all existing suggestions** (confirmed)
  - **Where:** `components/kerning/KerningSelectionView.tsx` 81.
  - **Problem:** it dispatches `SET_SUGGESTIONS`, which replaces the whole map. Unaccepted suggestions from earlier runs and from the background worker disappear.
  - **Fix:** use `MERGE_SUGGESTIONS`.
  - **Fixed:** Auto-Kern adds its results to the existing suggestions (`MERGE_SUGGESTIONS`) instead of replacing them.

- [x] **K7 Kerning worker results dropped or misrouted** (confirmed by tracing)
  - **Where:** `KerningContext.tsx` 112–139, 233–236.
  - **Problem:** `shouldDispatchDiscoveryRef` is a single global flag, so a background batch processed during "Detect new pairs" is discarded and never retried. `batchId` is sent but never checked. A second discovery call overwrites the first call's resolver, so the first promise never settles.
  - **Fix:** tag replies with `batchId`, and keep a map from batch ID to handler.
  - **Fixed:** each worker request is registered by batch id with its own handler (background vs discovery); progress and results are routed by id, background results during a discovery are kept, and concurrent discoveries each settle. Not checked in the browser.

- [x] **K8 Virtual ligature code points are unstable and can collide** (likely)
  - **Where:** `hooks/positioning/usePositioningData.ts` 62, 136–142; `usePositioningActions.ts` 341–353.
  - **Problem:** the counter restarts at 0x100001 on every recompute, so a new pair can reuse a persisted code point. That pair then vanishes from the grid, and baked data is shown for the wrong pair.
  - **Fix:** derive a stable ID from base+mark, or allocate above the highest existing code point.
  - **Fixed:** one shared allocator (`utils/virtualCodePoints.ts`, tested) used by the positioning workspace and the editor modal: the code point is derived from the base+mark pair and skips any code point already in the project, so it's stable and can't collide with saved pairs.

- [x] **K9 Copy Positions bakes outline marks in the wrong place** (confirmed)
  - **Where:** `usePositioningActions.ts` 319–322.
  - **Problem:** it translates `points` but not `segmentGroups`, and it bakes ligature glyphs even for GPOS-only pairs.
  - **Fix:** use the shared transform helper, and write glyph data only when the rule has `gsub`.
  - **Fixed:** Copy Positions moves outline marks too (shared `translatePaths`), and bakes a combined glyph only when the pair's rule has `gsub`, like the other positioning paths. Not checked in the browser.

- [x] **K10 Documented `center` anchor not implemented** (confirmed)
  - **Where:** `getAttachmentPointCoords` in `positioningHeuristicsService.ts` 56 and `glyphRenderService.ts` 220.
  - **Problem:** `center` falls through to topLeft.
  - **Fix:** add the case, and add it to the `AttachmentPoint` type.
  - **Fixed:** `center` added to both implementations, the `AttachmentPoint` type and the anchor dropdowns; tested that both copies agree on all nine points.

- [x] **K13 Propagation count and Undo are wrong when re-editing** (confirmed)
  - **Where:** `usePositioningActions.ts` 141; `components/UnifiedEditorModal.tsx` 179.
  - **Problem:** `newSize - oldSize - 1` gives -1 or 0 when the siblings already exist, so no toast or Undo appears.
  - **Fix:** count the sibling keys actually written.
  - **Fixed:** the count is the sibling pairs actually written or changed, so the message and Undo appear when re-editing. Not checked in the browser.

- [x] **K14 `isGsubPair` checks the base instead of the mark** (confirmed)
  - **Where:** `components/PositioningEditorPage.tsx` 165.
  - **Problem:** the Properties button never shows for GSUB pairs in the Positioning workspace.
  - **Fix:** use `props.markChar.name`.
  - **Fixed:** uses the mark name, via a tested `isGsubPositioningPair` helper. About eight other places copy the same rule lookup and could use it later.

- [x] **K15 Kerning canvas zoom drift and stranded pagination** (confirmed)
  - **Where:** `useKerningCanvas.ts` 128–144; `KerningSelectionView.tsx` 53–65, 287.
  - **Problem:** wheel zoom ignores the centre translation, so it drifts about 40 px per step. `currentPage` is never reset, so a narrowed search shows "No results" with no pagination controls.
  - **Fix:** correct the zoom math, and reset to page 1 when the filter changes.
  - **Partly fixed:** pagination part: the page snaps back to the last page when a narrower search leaves it past the end. Zoom now keeps the point under the cursor fixed (the offset is computed relative to the canvas centre, matching how the view is drawn).

---

## P: Persistence and project lifecycle

- [x] **P1 ⚠ Cascade worker killed on every LayoutContext change, so baked dependent glyphs go stale** (confirmed: in the browser a save sent a job and the worker was restarted before it replied; run on its own, the worker re-bakes a linked glyph correctly)
  - **Where:** `hooks/actions/useGlyphActions.ts` 438–471 (deps `[glyphDataDispatch, layout, t]`); `contexts/LayoutContext.tsx` 184 (`value` not memoized).
  - **Problem:** every notification, selection or keystroke terminates and recreates the worker, dropping queued jobs and re-importing paper.js from the CDN. `handleSaveGlyph` shows a notification right before posting the job. Linked glyphs look fine in the UI, because they're rebuilt live, but the export uses the stale stored data.
  - **Fix:** create the worker once and read `layout`/`t` through refs. Memoize the LayoutContext value.
  - **Fixed:** the cascade worker is created once; `layout`, `t` and the dispatcher are read through refs. Checked in the browser with the linked `கி` (க + ி): on the old build its stored drawing was never written (so it was missing from exports); now it is written and updated when க is edited. (Memoizing the LayoutContext value is a separate, broader change, not done.)

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
  - **What users see today:** whichever tab saves last wins, silently. Each tab autosaves its own in-memory copy over the stored project, so working in tab A and then touching tab B throws A's work away; a project deleted in one tab is recreated by the other's autosave.
  - **Wanted:** a warning when the same project is open in two tabs (Web Locks per project id, BroadcastChannel for the handover). Options:
    1. warning banner only (both tabs keep saving);
    2. warning, and the second tab doesn't save, with a "Use this tab instead" button that moves saving to it (recommended);
    3. the second tab refuses to open the project.
  - **Waiting for:** the author's choice of option.

- [x] **P4 "Unsaved changes" flag turns on again after every save and load** (confirmed)
  - **Where:** `hooks/actions/useProjectPersistence.ts` ~78–90.
  - **Problem:** `lastSavedState` and `isScriptDataLoading` are effect triggers, so the flag is set right after a save or load. In manual mode the indicator never clears and the "change script"/"load project" confirmations always appear. (The new close prompt uses an exact check, so it isn't affected.)
  - **Fix:** derive dirtiness from an edit counter compared against the counter at save time.
  - **Fixed:** any edit schedules a short exact comparison with the last saved state, and the flag follows it; saves and loads no longer switch it back on. Checked in the browser in manual mode: the old build kept the marker after Save, now it clears.

- [ ] **P5 Snapshot restore marked as saved, so it is silently undone** (likely)
  - **Where:** `hooks/actions/useProjectLoad.ts` ~366; `hooks/useAppActions.ts` 229–238.
  - **Problem:** after a restore, `lastSavedState` is set to the restored data, so no save happens and the DB keeps the pre-restore version.
  - **Fix:** for restores, set `lastSavedState` to null or save immediately.

- [x] **P6 Loading is destructive before validation; a failed load can autosave junk** (likely)
  - **Where:** `useProjectLoad.ts` 65–68, ~347.
  - **Problem:** contexts are reset before validation. A file missing `settings` then throws, and autosave can write a hybrid record (old settings, empty glyphs).
  - **Fix:** validate and build the new state first, and disable autosave while `scriptDataError` is set.
  - **Fixed:** projects are validated (`utils/projectValidation.ts`, tested) before anything is cleared, both from a file and from the database; a failed load also counts as "not loaded" for autosave and the leave-page save. Checked in the browser with a file missing `settings`: the old build dropped the open project and showed "Error Loading Script Data"; now a message says why and the project stays open.

- [x] **P7 Save races: duplicate projects, and "save & continue" doesn't wait** (likely)
  - **Where:** `useProjectPersistence.ts` 108–112; `useAppActions.ts` 162; `useProjectLoad.ts` (onSaveAndConfirm).
  - **Problem:** a double Ctrl+S on a new project calls `addProject` twice. "Save & change" and "Save & load" don't await the save, so a failed save (e.g. QuotaExceeded) is reported after the work is already gone.
  - **Fix:** serialize saves through an in-flight promise, await them, and abort navigation on failure.
  - **Fixed:** saves are queued (one at a time, each with the latest state), the project id and saved state update immediately, and "Save & change", "Save & load" and the unsaved-rules Save wait for the save and stop if it fails. Checked in the browser by firing two Ctrl+S at once on a new project: old build 2 projects, now 1.

- [x] **P9 Guide font changed in Settings isn't saved** (confirmed)
  - **Where:** `useProjectPersistence.ts` (`getProjectState` uses `script.guideFont`); `components/SettingsPage.tsx` 60.
  - **Fix:** save `guideFont` from ProjectContext, and add it to the dirty deps.
  - **Fixed:** `getProjectState` saves the guide font from ProjectContext, and it counts as an unsaved change; checked in the browser.

- [x] **P10 "Include Latin" ignored for a new empty project** (confirmed)
  - **Where:** `ScriptSelection.tsx` ~515; `useProjectLoad.ts` 75, ~165.
  - **Problem:** `characterSets: []` is truthy, so the project starts with zero glyphs.
  - **Fix:** omit the field, or test `?.length`.
  - **Fixed:** empty lists are treated as "no sets" (`?.length`), so the toggle adds A–Z/a–z; checked in the browser. A saved project with a truly empty list now loads the script's default sets.

- [x] **P11 Status filters go stale after drawing** (confirmed)
  - **Where:** `hooks/useGlyphFilter.ts` 123.
  - **Problem:** the memo depends on `glyphDataMap`, which is mutated in place, and not on `glyphVersion`.
  - **Fix:** add `glyphVersion`.
  - **Fixed:** the filter reruns when any glyph changes (`glyphVersion` from GlyphDataContext).

- [x] **P12 One failed translation fetch blanks the whole app** (confirmed)
  - **Where:** `contexts/LocaleContext.tsx` 55–59, 138.
  - **Problem:** if any locale fails to load (offline, 5xx), `translations` stays null and the provider renders null.
  - **Fix:** use `Promise.allSettled` with `{}` per locale, or show an error state.
  - **Fixed:** translations load with `Promise.allSettled`; a failed locale becomes `{}` and falls back to English. Checked in the browser with `ta.json` blocked.

- [x] **P13 Undo of delete and bulk operations reverts later edits** (confirmed by reading)
  - **Where:** `handleDeleteGlyph` and the bulk operations in `useGlyphActions.ts` / `useBatchOperations.ts`.
  - **Problem:** they restore whole-map snapshots.
  - **Fix:** undo only the affected entries.
  - **Fixed:** single delete, bulk delete, bulk transform and bulk bearings now undo only what they changed (`utils/undoHelpers.ts`, tested; positioning gained a `MERGE_ENTRIES` action): the deleted character goes back to its old place, with its drawing and pairs, and later edits stay. Checked in the browser that undoing a delete brings the glyph back in place; that later edits survive is covered by the unit tests (the Undo button only shows for 3 s, which is too short to make edits in the browser test).

---

## R: Rules UI

- [x] **R1 ⚠ A dist rule with an unknown glyph white-screens the app** (confirmed)
  - **Where:** `components/rules/DistRulesEditor.tsx` 358, 380, 385, 388.
  - **Problem:** `allCharsByName.get(name)!` is passed to `GlyphTile`. There is no ErrorBoundary anywhere, so the whole tree unmounts every time the dist tab opens. Deleting or renaming a referenced glyph does the same.
  - **Fix:** render a placeholder when the lookup misses, validate on save, and add a top-level ErrorBoundary.
  - **Fixed:** missing glyphs show a dashed "?" tile with their name (checked in the browser with a project naming missing glyphs), and a top-level ErrorBoundary (`components/ErrorBoundary.tsx`) shows a "Something went wrong" screen with Try again / Reload instead of a blank page. Saving a spacing rule that names a glyph or group that doesn't exist is now refused with a message.

- [x] **R2 ⚠ Saving a rule silently overwrites another rule with the same output** (confirmed)
  - **Where:** `hooks/useRulesState.ts` (handleSaveNewRule/handleUpdateRule).
  - **Problem:** rules are keyed by their output glyph, so a second contextual rule producing the same replacement replaces the first. Editing a rule's output to an existing name deletes that rule.
  - **Fix:** warn or block on collision. Longer term, store rules as arrays.
  - **Fixed:** saving (new or edited) a rule whose result another rule in the same feature or lookup already produces is refused with a message, and the form keeps what was typed. Checked in the browser (AKHN: a second ligature producing ஸ்ரீ is refused; a different result saves). Storing rules as arrays, so two rules may share a result, is still open.

- [x] **R3 Renaming a group marks every group as a positioning group** (confirmed)
  - **Where:** `hooks/useRefactoring.ts` 47.
  - **Problem:** `setPositioningGroupNames(new Set(Object.keys(newState.groups)))`. After one rename every group shows the lock icon, and the groups appear in the Positioning Rules modal, where deleting them removes them globally.
  - **Fix:** only add or remove the renamed key.
  - (The "rename discards unsaved local edits" part is gone now that rule edits are committed immediately.)
  - **Fixed:** only the renamed group is swapped in `positioningGroupNames`.

- [x] **R4 Renaming a character-set header pre-fills the translated label and can break export** (confirmed)
  - **Where:** `components/CharacterGrid.tsx` 124–138; `components/DrawingWorkspace.tsx` 358–363.
  - **Problem:** pressing Enter without changes renames `vowels` to its translated label (e.g. `உயிரெழுத்துக்கள்`), which sanitizes to `@` and breaks FEA (see E5).
  - **Fix:** pre-fill `nameKey`, skip unchanged renames, and sanitize with a uniqueness check.
  - **Fixed:** an unchanged rename is ignored (checked in the browser: Enter on "Vowels" keeps `vowels`), and a name already used by another set is refused. The field still pre-fills the translated label, which is friendlier than the internal key. Sanitising non-Latin names for FEA belongs to E5.

- [x] **R5 Positioning rule editor adds one tag per keystroke** (confirmed)
  - **Where:** `components/rules/manager/RuleManager.tsx` 216, 225.
  - **Problem:** `<SmartGlyphInput value="" onChange={v => addTag(...)}>`, so typing `$cons` adds `$`, `c`, `o`… and the dropdown never filters.
  - **Fix:** keep local input state, and add a tag on select/Enter.
  - **Fixed:** tags are added only on Enter or when a suggestion is picked; typing just filters.

- [x] **R6 Positioning rule add/edit overwrites the wrong rule** (confirmed)
  - **Where:** `RuleManager.tsx` 398–408, 460, 468.
  - **Problem:** `!editingIndex` treats index 0 as falsy, so adding a rule while editing #1 overwrites #1. The editing `RuleEditor` has no `key`, so switching rules keeps the old form values.
  - **Fix:** use `editingIndex === null`, and set `key={editingIndex}`.
  - **Fixed:** the Add button checks `editingIndex === null`, opening a rule for editing closes the add form, and the edit form has `key={editingIndex}`.

- [x] **R7 Positioning group manager accepts empty names; renames don't refactor** (confirmed)
  - **Where:** `components/rules/manager/GroupManager.tsx` 273, 289, 325.
  - **Problem:** `groups['']` generates `@ = [...]`. Renaming `$foo` leaves stale references in rules and anchors.
  - **Fix:** require a non-empty sanitized name, and use `renameGroupInState`.
  - **Fixed:** empty names (or a bare `$`/`@`) are refused. Making renames update the rules that use the group is still open.

- [x] **R8 Lookups pane: shared add state, silent validation** (confirmed)
  - **Where:** `components/rules/LookupsPane.tsx` 38, 78, 99, 119.
  - **Problem:** "Add Single Rule" opens in every lookup at once, and validation errors go to a no-op `showNotification`.
  - **Fix:** store `{lookupKey, type}`, and pass the real notifier.
  - **Fixed:** the add form is tied to one lookup (`{lookupKey, type}`), and rule editors in the pane get the real notifier.

- [x] **R9 "Add Lookup" does nothing on an implied feature** (confirmed)
  - **Where:** `components/RulesPage.tsx` 541–560; `useRulesState.ts` (handleAddLookupReference).
  - **Fix:** create the feature, seeded with `inline` + `auto_generated`, before adding the reference.
  - **Fixed:** adding a lookup to a feature that exists only implicitly now creates the feature first (keeping its auto-generated rules). Checked in the browser: a new lookup added to Tamil's ABVS appears under it.

- [x] **R10 Typed but unconfirmed glyph is lost on Save** (confirmed)
  - **Where:** `components/RuleEditor.tsx` 225–249; `DistRulesEditor.tsx` 209–232.
  - **Problem:** `onBlur` clears `addValue` before Save runs.
  - **Fix:** commit a non-empty `addValue` on blur.
  - **Fixed:** a typed glyph is committed on blur (same check as Enter), so Save keeps it; Escape still discards.

- [x] **R11 Command palette search can clear while typing** (likely)
  - **Where:** `components/AppHeader.tsx` 121, 320; `components/CommandPalette.tsx` 175–178.
  - **Problem:** `handleCommandAction` is recreated on every render and is a dependency of the effect that calls `setSearchTerm('')`.
  - **Fix:** wrap it in `useCallback`, or rebuild the index only when the palette opens.
  - **Fixed:** the search box resets only when the palette opens, so it can't clear while typing.

- [x] **R12 `GlyphTile` reads a field the rules context doesn't have** (confirmed; TS2339)
  - **Where:** `components/GlyphTile.tsx` 35.
  - **Problem:** `const { groups } = useRules()` is always undefined, so `$groups` are ignored for positioned tiles.
  - **Fix:** use `state.fontRules?.groups`.
  - **Fixed:** already done in the type-error cleanup (`915db10`): `GlyphTile` reads `rulesState.fontRules?.groups`.

- [x] **R13 The substitution-rule editor accepts names that aren't glyphs** (seen in the browser while testing R2)
  - **Where:** `components/RuleEditor.tsx` (handleSave); the typed text in `SmartGlyphInput` is used as-is.
  - **Problem:** typing text that isn't a glyph name (e.g. `ஙஸ்ரீ`) and saving creates a rule whose result tile is empty. Export skips it as undrawn, so nothing breaks, but the rule is junk.
  - **Fix:** check every name against the project's glyphs and groups on save, as the spacing-rule editor now does (R1).
  - **Fixed:** `RuleEditor` checks every name (result, components, contexts) against the project's glyphs, groups and character sets on save and refuses unknown ones with a message, keeping the form open. Checked in the browser (AKHN, result `zzz-not-a-glyph` refused).

---

## U: UX, text and i18n

- ~~**U1 No way to switch between Simple and Advanced mode**~~: withdrawn. The modes were dropped on purpose in favour of progressive disclosure. The leftover code is listed under T4.

- [x] **U2 Raw i18n keys shown to users** (confirmed)
  - **Status:** partly fixed in `01969c4`: `scriptHebrew`, `scriptTutorial`, `archaicLetters` and the "s" script icons. The other set names listed below are still raw.
  - **Problem:**
    - `scriptHebrew` and `scriptTutorial` are missing from `en.json` (home-screen tiles).
    - Missing set `nameKey`s: `archaicLetters` (Tamil), `basicCyrillic`, `specialCyrillic`, `consonantsTemplate` (Kannada/Telugu), `ottu`, `LatinIndicLetters`, `mini_marks`, `letters`, `others`.
    - Script cards for Tutorial, Gurmukhi and Latin (Indic) show "s" as their icon (`ScriptSelection.tsx` ~789 falls back to `nameKey[0]`).
  - **Fixed:** English labels added for the 8 remaining set names (e.g. `ottu` "Ottu (Joined Consonants)", `consonantsTemplate` "Consonant Building Blocks"); Tamil falls back to English.

- [x] **U3 Tamil tutorial has 15 missing keys with no English fallback** (confirmed)
  - **Where:** `locales/tutorial/ta.json`; `components/TutorialManager.tsx`.
  - **Problem:** keys such as `relinkExpl`, `kerningNav`, `compositeTools` and `hintKerning*` are missing. Those steps render empty tooltips, and some have `hideFooter: true`.
  - **Fix:** fall back to English per key, and add the keys.
  - **Fixed:** tutorial strings fall back to English per key (`components/tutorial/tutorialTranslations.ts`, tested). The 15 keys are now translated (see U4).

- [x] **U4 Locale gaps in `ta.json`** (confirmed)
  - **Problem:** 15 keys are missing (they fall back to English, e.g. `copySelection`, `pasteSelection`, `ignorePair`). Three placeholder mismatches: `linkedGlyphLocked` drops `{components}`, `mismatchedScriptError` drops `{currentScript}`, and `mismatchedScriptMessage` drops both.
  - **Fixed:** all missing Tamil strings added (22 older ones, plus the error screen, "not in this project" and rule-clash messages added in this review), and the three placeholder mismatches fixed (`linkedGlyphLocked`, `mismatchedScriptError`, `mismatchedScriptMessage` now carry their full meaning and placeholders). The 15 missing tutorial lines (U3) are translated too. The Spacing tabs "Suggestions" / "Spaced" / "Kerned" were hard-coded English and are now translatable, so the Tamil tutorial refers to labels that actually appear. `npm run check:translations` reports nothing missing; checked in the browser in Tamil. The wording is the reviewer's and should be read by a Tamil speaker.

- [x] **U5 Tour and hint text shows raw markdown** (e.g. `**Pen Tool**`) (confirmed in the browser)
  - **Fixed:** one shared renderer (`utils/formattedText.tsx`, tested) for bold, italic and code in the tour, hints, Help and About; it replaced 23+ places that inserted locale text as raw HTML. The two notifications that still showed `**` now render bold too (`renderFormattedText` takes a bold class for coloured backgrounds).

- [x] **U6 The drawing tour reappears when a second glyph is opened and blocks the canvas** (confirmed in the browser)
  - **Fixed:** the toolbar tour is marked as seen as soon as it is shown, so it appears once however it ends (you don't have to click through all 16 steps). Checked in the browser: on the old build the tour came back after the page was reloaded mid-tour; now it doesn't. It is also non-blocking now: no dark overlay, Next/Close work as before, and clicking anywhere else (the canvas, Back, another glyph) ends it. Checked in the browser.

- [x] **U7 The "Create" (Creator Studio) button shows the "tasks incomplete… export anyway?" warning** (confirmed in the browser)
  - **Fixed:** Create opens Studio without the incomplete-tasks warning (still stops when nothing is drawn); checked in the browser.

- [x] **U8 Imported-font glyphs are labelled `U+0041` instead of their characters** (confirmed in the browser)
  - **Fixed:** new imports start with "Show Unicode values" off, like every other project (`services/importFontService.ts`); it can still be switched on in Settings. Projects imported earlier keep their saved setting. Checked in the browser: an imported font's grid shows no `U+` codes.

- [x] **U9 The feature-error dialog text is cut off** (confirmed in the browser)
  - **Fixed:** the error text wraps and scrolls inside a wider dialog.

- [x] **U10 The Positioning tab says "No mark characters have been drawn" when the marks are linked glyphs** (not a bug; verified)
  - **Re-checked (browser):** after drawing `e`, the linked `ͤ` gets its own drawing at once and counts as drawn. The Tutorial script's only positioning pairs are `n + ̃` and `n + ̄`; `ͤ` is in none, so the empty By Mark view was correct while `n`, `̃` and `̄` were undrawn. The link was never the cause. The author also found linked marks available for positioning in their own check.
  - **Still to verify:** positioning with a linked mark that *is* in a rule (e.g. add a rule using `ͤ`, then check it appears, previews correctly and exports).
  - **Changed:** the message was misleading (it said no marks were drawn when one was). It now reads "No marks are ready to position yet. In the character grid, draw the marks used in positioning and the letters they go on." (Tamil updated too).
  - **Verified:** verified properly: the Tutorial rule positions `ͤ` over `A`/`E`. With `e` and `A` drawn, By Mark lists `ͤ`, the A + ͤ preview shows the small e above A, and the exported font contains the `ͤ` outline and a mark-positioning lookup (GPOS type 4). The earlier "no marks" view came from drawing `a` instead of `A`.

- [x] **U11 The header ⋮ (More) button has no accessible name** (confirmed)
  - **Fixed:** ⋮ and the phone drawer's icon buttons have `aria-label` and `title`.

- [x] **U12 Switching locale doesn't refresh some memoized lists** (confirmed by reading)
  - **Where:** `LocaleContext.tsx` (`t` has empty deps), e.g. `SmartGlyphInput` options.
  - **Fixed:** `t` now changes identity when the language (or loaded translations) changes, so memoized lists rebuild after a switch; it stays stable otherwise. Only four effects depend on `t` (test-page font reload, command-palette index, comparison redraw, Save As default name); re-running them once on a switch is harmless. Not checked in the browser.

- [ ] **U13 ⚠ The tutorial can't get past "Click the 'A' card"** (likely; seen in headless Chromium on both the current and the previous build)
  - **Where:** `components/tutorial/useTutorialSteps.ts` step 1 (`spotlightClicks: true`); react-joyride's overlay.
  - **Problem:** the overlay stays on top of the highlighted card even while the pointer is over it, so the click lands on the overlay: the tour closes and the editor doesn't open.
  - **Check:** try it in a normal browser (Start tutorial → Next → click A). If it works there, it's a headless-only artefact.

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

- [x] **S6 Missing or broken files:**
  - `data/rule_german.json` is 0 bytes and misnamed;
  - `rules_hebrew`, `rules_german`, `positioning_latin` (Latin logs a JSON parse error), `sample_lao` and `sample_tutorial` don't exist;
  - the tutorial's curated `sampleText` from `scripts.json` is thrown away when the `.txt` fetch returns HTML (`useProjectLoad.ts` ~305).
  - **Fixed:** `rules_german.json` (was 0 bytes and misnamed) now matches the other Latin languages. Optional files (rules, positioning, FEA, sample text) that come back missing or as an HTML page are treated as absent (`utils/optionalFetch.ts`, tested), so the Latin parse error is gone and the tutorial keeps its sample text. Required files still fail loudly.

- [x] **S7 Guide fonts:** the Noto Greek/Cyrillic URLs return 404/403 on every landing load (`scripts.json` ~773, ~817). Gurmukhi's guide font is Noto Sans Devanagari. The jsDelivr `gh/` URLs have no `@ref`, so they track the default branch.
  - **Fixed:** Greek and Cyrillic use Noto Sans (which covers both; the old per-script folders don't exist), Gurmukhi uses Noto Sans Gurmukhi, and every guide-font URL plus the logo font is pinned to a commit. Each URL checked: HTTP 200, real font, byte-identical to what was served before.

---

# Technical issues

Code health only; no direct effect on what users see. (K12 is felt only as waiting; P8 and P14 matter only if people share project files.)

## Dependencies

- [x] **E11 Remote code still unpinned** (confirmed)
  - **Where:** `pythonFontService.ts` 13, 251, 264; `index.html` 12; the inline workers in `hooks/actions/useGlyphActions.ts` ~39 and `services/autoKerningService.ts` ~6.
  - **Problem:**
    - `micropip.install('fontFeatures')` has no version or hash.
    - `index.html` loads Pyodide 0.25.0 on the main thread, but nothing uses it there (the worker uses 0.25.1).
    - The cascade and auto-kern workers load paper.js 0.12.17 from cdnjs, while the app bundles 0.12.18.
    - The `pyodide` and `unicode-name` npm dependencies are unused.
  - **Fix:** pin `fontFeatures==x.y` with a hash, remove the `index.html` script and the unused dependencies, and bundle paper.js into those workers (as was done for the font worker).
  - **Fixed:** fontFeatures is installed from its exact wheel URL with a sha256 (1.9.0, as before), like fontTools. The unused main-thread Pyodide script and the `pyodide`/`unicode-name` packages are gone. The cascade and auto-kern workers are now bundled module workers (`workers/cascadeWorker.js`, `workers/autoKerningWorker.js`) using the app's own paper.js, with no CDN load.

---

## Dead code

- [x] **K11 Positioning heuristics are dead code with inverted precedence** (confirmed)
  - **Where:** `positioningHeuristicsService.ts` 24–54, 147–180.
  - **Problem:** `getCombiningClass` returns strings, so the numeric checks never match, and the fetched JSON shape is parsed wrongly. The only effect is a wasted CDN fetch (unpinned `@main`) on load. If these tiers were fixed, they would override explicit project rules.
  - **Fix:** remove them, or fix the parsing and check project rules first.
  - **Fixed:** both tiers removed, with the CDN fetch and its startup call. Checked first that neither ever matched (0 of the Indic code points U+0900–U+1CFF matched against the live data), so no placement changes.

- [x] **S8 `data/characters_custom.json` isn't referenced by any script.**
  - **Fixed:** removed. Character files are loaded by script ID and no script has the ID `custom`.

- [x] **T4 Dead code:**
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
  - **Fixed:** removed the stale root `DrawingModal.tsx`/`LayoutContext.tsx`, `contexts/EditorContext.tsx`, the old `workers/cascadeWorker.ts`, the duplicate `ProjectContext` fields (`GlyphTile` now reads `metrics` from SettingsContext), the `GEMINI_API_KEY` define and the metadata typo. Simple/Advanced leftovers: `handleEditorModeChange` and `settings.editorMode` are gone, and `preferKerningTerm` alone picks the Kerning/Spacing label. Saved and newly created 'advanced' projects keep showing "Kerning" (`utils/legacySettings.ts`, tested). Removed the unused mode locale keys. QA cases: dropped the `ADVANCED:` prefix from 66, reworded 5 that said "in Advanced mode", and deleted 3 that tested the mode switch itself (427 → 424).

---

## Speed

- [x] **K12 Auto-kern discovery is slow on large glyph sets** (likely)
  - **Where:** `services/autoKerningService.ts` 319–356.
  - **Problem:** `solvePair` recomputes paper.js zones for both glyphs of every one of the n² pairs.
  - **Fix:** cache zones per unicode from step 1.
  - **Fixed:** zones are cached per glyph for each batch. Benchmark with outline glyphs: 120 glyphs 267 → 129 ms, 250 glyphs 763 → 349 ms, with identical results (47,275 pairs).

---

## Security hardening

- [x] **P8 Crafted rules/positioning file can pollute `Object.prototype`** (confirmed)
  - **Where:** `useProjectLoad.ts` ~252–257.
  - **Problem:** `gsub: "__proto__"` sets `Object.prototype.liga = {}`, which corrupts state app-wide or crashes it. No XSS.
  - **Fix:** reject `__proto__`/`constructor`/`prototype` keys, or use `Object.create(null)`/Maps. Schema-validate imported files.
  - **Fixed:** user files are parsed with `safeJsonParse` (drops `__proto__`/`constructor`/`prototype` keys at any depth), and file values used as keys go through `isSafeKey` (`utils/safeJson.ts`, tested).

- [x] **P14 Guide-font name/URL interpolated into `<style>`** (confirmed; low)
  - **Where:** `App.tsx` ~287; `ScriptSelection.tsx` ~215.
  - **Problem:** this allows CSS injection or external loads from project or script files. Scripts can't run.
  - **Fix:** validate or escape the values, or use the `FontFace` API.
  - **Fixed:** `utils/cssFont.ts` writes the name and URL as escaped CSS strings and accepts only http(s)/data:/blob: URLs; the rules are set with `textContent`. Tested, including break-out attempts.

---

## Tooling: tests, lint, types, build


- [x] **T1 Tests:**
  - `vitest` is in `dependencies` (move it to `devDependencies`);
  - there's no `test` script, though TESTING.md documents `npm run test`;
  - `utils/vectorUtils.test.ts` fails on `-0` vs `+0`;
  - `contexts/RulesContext.test.ts` tests a copy of the reducer, not the real one.
  - **Fixed:** `vitest` is a devDependency; `npm test`, `test:watch`, `typecheck` and `check` scripts added. The `-0` test compares numerically. The rules reducer moved to `contexts/rulesReducer.ts` and the test uses it. 74 tests now (new ones for safeJson, cssFont, legacySettings).

- [x] **T2 Lint fails with 340 errors** (mostly unused vars and prefer-const). `eslint-plugin-react-hooks` is installed but not enabled. `globals` is imported by the config but not declared.
  - **Fixed:** 0 errors (from ~315). `react-hooks` is enabled (`rules-of-hooks` error, `exhaustive-deps` warn), `globals` is a declared devDependency, and Node/worker globals are configured for scripts and workers. 69 `exhaustive-deps` warnings remain on purpose: changing hook dependencies changes behaviour, so they need case-by-case review.

- [x] **T3 `tsc --noEmit` reports 43 errors, and there's no typecheck step or CI.** Notable ones:
  - `components/DrawingModal.tsx:16` imports a nonexistent `useSliceTool`;
  - the PositioningEditorPage/Workspace import paths are wrong;
  - the `importFont` modal key is missing from the type;
  - `openPalette` is missing from `LayoutContextType`.
  - **Fixed:** `tsc` reports 0 errors (from 43); `npm run typecheck` added. Three of the errors hid real bugs, listed under "Found while fixing" below. No CI workflow yet.

- [x] **T5 One-off scripts in the repo root:** `gen_chars.cjs`, `test_unicode*.cjs` and `patch_locales.cjs` (already applied). `generate_malayalam_traditional_v2.cjs` overwrites hand-edited data. `check_translations.js` fails in ESM. `data/add_liga.js` and `data/remove_gsub.js` are broken. `scripts/fetchIndicCategories.ts` mixes UCD 16 and 17.
  - **Fixed:** removed the one-off and unsafe scripts (including the Malayalam generator that overwrote hand-edited data and the two broken `data/*.js`). The checkers moved to `scripts/` (`npm run check:translations` works again). `fetchIndicCategories.ts` uses one UCD version (17.0.0); `utils/indicCategoryUtils.ts` hasn't been regenerated.

- [x] **T6 Build:**
  - the main chunk is 1.9 MB (code-split it);
  - a stray `[file:line]` Tailwind class causes a build warning;
  - the `/vite.svg` favicon returns 404.
  - **Fixed:** no build warnings. The landing page loads 172 kB of app code (was 1.9 MB); the editor and occasional screens (Settings, Rules, Studio, Test page, comparison, tutorial, test cases, positioning rules), the FEA generator and the image tracer load on demand. `paper` resolves to paper-core (drops the bundled JS parser; workers shrank by ~40%). Vendor chunks for React, paper, opentype.js and react-virtuoso. The `[file:line]` class came from docs; Tailwind no longer scans `*.md` and `scripts/`. New `public/favicon.svg` from the logo glyph.

- [x] **T7 `npm audit` reports 27 vulnerabilities** (1 critical, 11 high), not yet assessed. Many may be in dev-only packages.
  - **Mostly fixed:** 26 findings (1 critical, 10 high) → 10 (0 critical, 0 high), via `npm audit fix` with npm 11. Left: 7 moderate in lint tooling (`minimatch` under `typescript-eslint`; the latest typescript-eslint still uses it, and npm's suggested "fix" is a downgrade) and 3 low from `react-joyride` → `deepmerge` (fix needs joyride 3, a breaking upgrade; the tour only merges the app's own fixed data). The shipped app has only those 3 low.

- [x] **T8 No version pin for npm** (`packageManager`/`engines`), so lockfile flags change between npm versions.
  - **Fixed:** `packageManager: npm@11.21.2` and `engines.node` matching the toolchain (Node 20, 22 or 24+). npm 10.9 crashes in this repo when it has to re-resolve vitest's peers (`Cannot read properties of null (reading 'edgesOut')`); npm 11 doesn't.


- [x] **T9 No CI:** nothing ran the checks on push.
  - **Fixed:** `.github/workflows/check.yml` runs `npm ci` and `npm run check` (typecheck, lint, tests, build) on every push and pull request.