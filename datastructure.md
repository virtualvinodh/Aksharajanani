# Aksharajanani: Data Structure Spec (V16.0)

This document defines the absolute schema for project persistence, session state, and geometric models.

---

## 1. Project Root (`ProjectData`)
Stored in IndexedDB `projects` store.

| Field | Type | Description |
| :--- | :--- | :--- |
| `projectId` | `number` | Unique ID (Auto-increment PK). |
| `name` | `string` | User-defined project name. |
| `glyphs` | `[number, GlyphData][]` | Map: `Decimal Unicode` -> `Geometry`. |
| `markPositioning`| `[string, Point][]` | Serialized `markPositioningMap`. |
| `positioningRules`| `PositioningRules[]`| Global GPOS rule definitions. |
| `markAttachmentRules`| `MarkAttachmentRules`| Manual anchor point overrides. |
| `markAttachmentClasses`| `AttachmentClass[]`| Automated positioning groups. |
| `savedAt` | `string` | ISO 8601 modification timestamp. |

---

## 2. Geometric & Component Models

### A. Path (`Path`)
- `id`: `string` (UUID).
- `type`: `pen | calligraphy | dot | line | circle | curve | ellipse | outline`.
- `points`: `Point[]` (Flattened vertices).
- `segmentGroups`: `Segment[][]` (Nested arrays for complex outlines with holes).
- `groupId`: `string` (Link ID for multi-path components).

### B. Component Transform (`ComponentTransform`)
Used in `Character.compositeTransform` to define relative placement.
- `scale`: `number` (Default 1.0).
- `x` / `y`: `number` (Offset from anchor).
- `mode`: `relative | absolute | touching`.

### C. Attachment Class (`AttachmentClass`)
Defines the "Representative-Sibling" relationship for auto-sync.
- `name`: `string`.
- `members`: `string[]` (Glyph names or `@groups`).
- `applies`: `string[]` (Filter: Only sync when attached to these bases).
- `exceptions`: `string[]` (Filter: Do not sync on these bases).
- `exceptPairs`: `string[]` (String: "Base-Mark" format for manual unlinking).

---

## 3. Runtime Logic State

### A. MarkPositioningMap
The active lookup table for GPOS offsets used during rendering and export.
- **Type**: `Map<string, Point>`
- **Key Format**: `${baseUnicode}-${markUnicode}` (e.g., `"2965-3021"`)
- **Generation**: Created JIT in `PositioningWorkspace` via rules, or modified via manual user drag.

### B. Project Snapshot (`ProjectSnapshot`)
Stored in IndexedDB `snapshots` store.
- **Limit**: Only the most recent **5 snapshots** are retained per project.
- `id`: `number` (PK).
- `projectId`: `number` (FK).
- `data`: `ProjectData` (Deep copy of state).
- `timestamp`: `number` (Epoch).

---

## 4. UI & Logic State

### A. Creator Settings (`CreatorSettings`)
- `textPos`: `{ x, y }` (Relative to high-res canvas).
- `bgImageData`: `string` (Base64 raster background).
- `aspectRatio`: `square | portrait | landscape`.

### B. Search Query (`SearchQuery`)
The internal model for the smart command palette.
- `lower`: `string` (Lowercase normalized query).
- `unicodeHex`: `string | null` (Extracted hex if query starts with U+ or 0x).
- `exactMatch`: `string | null` (Extracted content if query is wrapped in quotes).