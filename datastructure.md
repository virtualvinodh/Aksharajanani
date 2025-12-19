# Aksharajanani: Data Structure Spec (V16.0)

This document defines the absolute schema for project persistence and session state.

---

## 1. ProjectData Schema (`ProjectData`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `projectId` | `number` | PK in IndexedDB. |
| `scriptId` | `string` | Template identifier. |
| `name` | `string` | Display name for the project dashboard. |
| `settings` | `AppSettings` | Global config + `creatorSettings` block. |
| `metrics` | `FontMetrics` | UPM, Ascender, Descender, and Canvas Guides. |
| `glyphs` | `[number, GlyphData][]` | Map: Decimal Unicode -> Path Data. |
| `characterSets` | `CharacterSet[]` | Tab-based organization of glyphs. |
| `fontRules` | `FeatureAST` | The GSUB logic tree + `groups` + `lookups`. |
| `kerning` | `[string, number][]` | Map: `LeftUni-RightUni` -> Kern value. |
| `markPositioning`| `[string, Point][]` | Map: `BaseUni-MarkUni` -> GPOS vector. |
| `isFeaEditMode` | `boolean` | Flag for manual FEA override. |
| `manualFeaCode` | `string` | The raw FEA code used in manual mode. |
| `guideFont` | `GuideFont` | Background tracing font configuration. |
| `savedAt` | `string` | ISO modification timestamp. |

---

## 2. Vector Models

### A. Path (`Path`)
- `id`: `string` (UUID).
- `type`: `pen | calligraphy | dot | line | circle | curve | ellipse | outline`.
- `points`: `Point[]` (Primary vertices).
- `groupId`: `string` (Link to `component-X` or custom groups).
- `segmentGroups`: `Segment[][]` (Handles/Holes for `outline` paths).
- `angle`: `number` (Angle of the nib for `calligraphy` type).

### B. GlyphData (`GlyphData`)
- `paths`: `Path[]`.
- `_cache`: Internal bbox and stroke thickness cache.

---

## 3. UI & Persistence Models

### A. Creator Studio (`CreatorSettings`)
- `text`, `fontSize`, `textColor`, `bgColor`, `bgImageData`, `overlayOpacity`, `textAlign`, `aspectRatio`, `addShadow`, `textPos`.

### B. Version History (`ProjectSnapshot`)
- `id`: PK.
- `projectId`: FK to main project.
- `data`: Complete `ProjectData` object.
- `timestamp`: Creation time.

---

## 4. Mandatory Export Glyphs
- **`.notdef`** (Uni 0): A rectangle with a stroke width of $1/25$ of the UPM.
- **`space`** (Uni 32): Advance set by `metrics.spaceAdvanceWidth`.
- **`zwj` / `zwnj`** (Uni 8205/8204): Force-assigned 0-width control characters.
