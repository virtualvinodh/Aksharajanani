# characters.json Data Format Guide

The `characters.json` file (and its script-specific variants like `characters_tamil.json`) is the backbone of an Aksharajanani project. It defines the inventory of glyphs, their Unicode codepoints, categorization, and construction logic.

## Root Structure

The file is a JSON **Array** of **Character Sets**. This structure allows the UI to group glyphs into tabs (e.g., Vowels, Consonants, Symbols).

```json
[
  {
    "nameKey": "vowels", 
    "characters": [ ...list of character objects... ]
  },
  {
    "nameKey": "consonants",
    "characters": [ ...list of character objects... ]
  }
]
```

*   `nameKey`: A string key used for the tab label (translated via `locales/*.json`). Common keys: `vowels`, `consonants`, `vowelSigns`, `conjuncts`.

---

## Character Object Fields

Each object in the `characters` array represents a single glyph (or a virtual logic container).

### 1. Identity & Metrics

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | **Required.** The unique identifier for the glyph. Used in FEA code and internal logic. Must be alphanumeric (underscores allowed). |
| `unicode` | `number` | **Optional.** The **Decimal** Unicode codepoint (e.g., `65` for 'A', not `0x41` or `U+0041`). If omitted, the glyph is treated as a non-standard glyph (referenced by name only). |
| `glyphClass` | `string` | **Required.** Categorization for OpenType GDEF tables.<br>• `base`: Standard characters (letters, numbers).<br>• `mark`: Combining marks (vowel signs, nuktas).<br>• `ligature`: Combined shapes.<br>• `virtual`: Logic-only container (no geometry output). |
| `advWidth` | `number` \| `string` | **Optional.** Overrides the default advance width. **Crucial:** Set to `0` for non-spacing marks. |
| `lsb` | `number` | **Optional.** Manual Left Side Bearing override. |
| `rsb` | `number` | **Optional.** Manual Right Side Bearing override. |
| `label` | `string` | **Optional.** Display text for the UI grid (Ghost text). Defaults to `name` if omitted. |

### 2. Geometric Construction (Visual)

These fields define how the glyph looks by reusing other glyphs.

| Field | Type | Description |
| :--- | :--- | :--- |
| `composite` | `string[]` | A list of glyph names. Their paths are **copied** into this glyph. Changes to the source glyphs affect this one only if the "Refresh" action is triggered or the project is reloaded. |
| `link` | `string[]` | A list of glyph names. This glyph is **live-linked** to the sources. Changes to source paths update this glyph immediately. The editor locks manual drawing for linked glyphs. |
| `compositeTransform` | `object[]` | Array of transform configs corresponding to the `composite` or `link` array. See **Transform Details** below. |

#### Transform Details (`compositeTransform`)

This array configures exactly how each component is placed. The index in this array matches the index in `composite` or `link`.

**Structure:** `[{ scale: 1, x: 0, y: 0, mode: 'relative' }, ...]`

**The First Component (Index 0):**
*   **Behavior:** It is always placed relative to the origin (0,0).
*   **Mode:** The `mode` setting is ignored.
*   **Offsets:** `x` and `y` shift the component from its original drawing coordinates.

**Subsequent Components (Index > 0):**

| Mode | Behavior | Does it use `positioning.json`? |
| :--- | :--- | :--- |
| `'relative'`<br>**(Default)** | **Smart Placement.** The system calculates an "Automatic Offset" based on anchor points defined in `positioning.json` (e.g., centering a mark above a base). Your `x` and `y` values are **added** to this automatic calculation as a manual tweak. | **Yes.** |
| `'absolute'` | **Raw Coordinates.** The system places the component at (0,0). Your `x` and `y` values shift it from there. Used for "Linked" glyphs where you want to preserve the exact positions drawn in the source glyphs. | **No.** (Ignored) |
| `'touching'` | **Auto-Flow.** Places the component immediately to the right of the previous components (based on visual bounding box). Adds `x` and `y` offsets to that spot. | **No.** |

### 3. Logical Construction (Logic -> Geometry)

These fields tell the system how to build the glyph logically, often inferring OpenType rules.

| Field | Type | Description |
| :--- | :--- | :--- |
| `position` | `[base, mark]` | Defines the glyph as a specific Base + Mark combination. <br>• If `glyphClass: 'virtual'`, generates GPOS positioning rule.<br>• If `glyphClass: 'ligature'`, bakes a new fused glyph. |
| `kern` | `[left, right]` | Defines the glyph as a specific Left + Right combination.<br>• Generates a fused pair (baked geometry) with specific spacing. |

### 4. OpenType Feature Generation

These fields explicitly control the generated FEA code.

| Field | Type | Description |
| :--- | :--- | :--- |
| `gsub` | `string` | The GSUB Feature Tag (e.g., `'liga'`, `'akhn'`, `'psts'`). If present, the system generates a `sub ... by Name` rule. |
| `gpos` | `string` | The GPOS Feature Tag (e.g., `'abvm'`, `'blwm'`). Used for virtual positioning rules. |
| `liga` | `string[]` | **Explicit Ligature Definition.** Array of component names that form this ligature. <br>Example: `{"name": "ffi", "liga": ["f", "f", "i"], "gsub": "liga"}` generates `sub f f i by ffi;`. |

### 5. UI & Variants

| Field | Type | Description |
| :--- | :--- | :--- |
| `hidden` | `boolean` | If `true`, the glyph is hidden from the main grid but exists in the font. Useful for intermediate components. |
| `option` | `string` | Used for **Script Variants**. Glyphs with the same `option` key (e.g., "Style 1") are grouped in the setup wizard. |
| `if` | `string` | Conditional inclusion. This glyph is only included if the glyph named in `if` is also selected/present. |
| `desc` | `string` | Description displayed in the Script Variant wizard (e.g., "Traditional Form"). |

---

## Automatic Unicode Assignment

If the `unicode` field is omitted in the JSON, Aksharajanani assigns one automatically during project load based on the contents of the `name` field. This ensures every glyph has a valid ID for the font compiler.

| Condition | Behavior | Example |
| :--- | :--- | :--- |
| **Single Character Name** | The system calculates the standard Unicode codepoint of the character. | `"name": "A"` → becomes `unicode: 65`<br>`"name": "€"` → becomes `unicode: 8364` |
| **Multi-Character Name** | The system assigns a code from the **Private Use Area (PUA)**, starting at `0xE000` (57344). | `"name": "fi"` → becomes `unicode: 57344` (or next available PUA)<br>`"name": "my_logo"` → becomes `unicode: 57345` |

**Note:** For standard characters, it is best practice to provide the explicit `unicode` field to avoid ambiguity, but the automatic assignment is useful for rapid prototyping.

---

## Common Patterns & Examples

### 1. Standard Base Character
```json
{ 
  "unicode": 65, 
  "name": "A", 
  "glyphClass": "base" 
}
```

### 2. Non-Spacing Mark (e.g., Vowel Sign)
**Tip:** Always set `advWidth` to 0 for marks that should float over/under other letters.
```json
{ 
  "unicode": 769, 
  "name": "acute", 
  "glyphClass": "mark", 
  "advWidth": 0 
}
```

### 3. Standard Ligature (e.g., 'fi')
This creates a concrete glyph `fi` and writes the rule `sub f i by fi;` in the `liga` feature.
```json
{ 
  "name": "fi", 
  "glyphClass": "ligature", 
  "liga": ["f", "i"], 
  "gsub": "liga" 
}
```

### 4. Virtual Positioning Rule
This does **not** create a glyph shape. It tells the font engine: "When `A` is followed by `acute`, position `acute` relative to `A` using anchor points."
```json
{ 
  "name": "A_acute_pos", 
  "glyphClass": "virtual", 
  "position": ["A", "acute"], 
  "gpos": "mark" 
}
```

### 5. Baked Conjunct (Indic)
This creates a new glyph shape by merging `Ka` and `Virama`, and generates a substitution rule `sub Ka Virama by K_Virama` in the `haln` feature.
```json
{ 
  "name": "K_Virama", 
  "glyphClass": "ligature", 
  "position": ["Ka", "Virama"], 
  "gsub": "haln" 
}
```
