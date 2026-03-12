# rules.json Data Format Guide

The `rules.json` file is the engine room of your font. It defines OpenType Substitution (GSUB) and Positioning (GPOS) logic that cannot be handled by simple anchor points. This includes ligatures, contextual substitutions, and complex script behaviors (like Indic reordering or reshaping).

The system uses this JSON to generate an Adobe Feature File (`.fea`) during export.

## Root Structure

The file is organized hierarchically: **Root -> Script -> Feature -> Rule Type -> Rules**.

```json
{
  "groups": { ... },
  "lookups": { ... },
  "DFLT": { ... },
  "tml2": { ... },
  "dev2": { ... }
}
```

*   **groups**: Definitions of glyph classes used across the file.
*   **lookups**: Standalone lookup blocks that can be referenced by multiple features or ordered specifically.
*   **Script Tags** (`DFLT`, `tml2`, `latn`, etc.): The top-level keys must be valid OpenType Script tags.

---

## 1. Groups (`groups`)

Defines named collections of glyphs. These translate to `@ClassName = [...]` in FEA code.

*   **Key**: Group name (without `@`).
*   **Value**: Array of glyph names.

```json
"groups": {
  "virama": ["्"],
  "vowels": ["అ", "ఆ", "ఇ"],
  "matras": ["ా", "ి", "ీ"],
  "all_vowels": ["$vowels", "$matras"]
}
```

### Referencing External Sets
You can include groups defined in other files by using the `$` prefix. This avoids duplication:
*   **Character Sets:** Reference the `nameKey` from `characters.json` (e.g., `$consonants`).
*   **Positioning Groups:** Reference groups defined in `positioning.json`.

---

## 2. Features

Inside a Script Tag object (e.g., `tml2`), keys represent **Feature Tags** (e.g., `akhn`, `liga`, `pres`).

### A. Simple (Inline Rules)
For most standard features, you can simply define the rule types directly inside the feature object. The system will process them in a default order.

```json
"tml2": {
  "akhn": {
    "liga": { ... },
    "context": { ... }
  }
}
```

### B. Advanced Ordering (`children`)
If you need precise control over the execution order (e.g., running a specific lookup *before* inline rules, or placing auto-generated rules at the end), use the `children` array.

**The order in this array is strictly preserved** in the final font file. In OpenType, if multiple rules could apply, the first one listed takes priority.

| Type | Description |
| :--- | :--- |
| `lookup` | References a named lookup from the root `lookups` object. |
| `inline` | Processes rules defined directly within the feature object (e.g., `liga`, `context`). |
| `auto_generated` | Automatically builds rules based on character metadata (e.g., `liga` and `gsub` properties in `characters.json`). |

**Example:** Combining custom logic with automatic rules.
```json
"haln": {
  "lookupflags": {
    "UseMarkFilteringSet": "@virama"
  },
  "children": [
    { "type": "lookup", "name": "special_edge_cases" },
    { "type": "auto_generated" },
    { "type": "inline" }
  ],
  "liga": {
    "క్": ["క", "్"] // This goes into the "inline" block
  }
}
```
*In this example, `special_edge_cases` runs first, followed by all auto-generated ligatures from `characters.json`, and finally the inline `క్` rule.*

### C. Legacy Ordering (`lookups`)
Older versions of the system used a simple string array to reference lookups. This format is still supported for backward compatibility but is **deprecated**.

```json
"blws": {
  "lookups": ["swapK_1", "swapK_2"]
}
```

#### Migration Behavior
When the application loads a project with the legacy `lookups` format, it automatically:
1.  Converts the string array into the `children` format.
2.  Wraps any existing inline rules (like `liga` or `context`) into an `{ "type": "inline" }` block.
3.  **Appends** `{ "type": "auto_generated" }` to the end of the `children` list.

**Note:** If you need auto-generated rules to run *before* your lookups, you must manually convert to the `children` format.

---

## 3. Rule Types

Each feature object contains sub-objects defining the specific type of OpenType rule.

### A. Ligature Substitution (`liga`)
Replaces a sequence of glyphs with a single glyph. `sub f i by fi;`

*   **Key**: The **Output** glyph name (the ligature).
*   **Value**: Array of **Input** component names.

```json
"liga": {
  "fi": ["f", "i"],
  "k_virama_sa": ["k", "virama", "sa"]
}
```

#### Using Groups in Ligatures
You can use a Group (starting with `$`) as an input component. This creates a "Many-to-One" rule, where *any* member of the group in that position will trigger the substitution.

**Example (Tamil):** Both `Sa` and `Sha` combined with `Virama + Ra + II` produce the `Sri` ligature.
1. Define group: `"sa_sha": ["ஸ", "ஶ"]`
2. Define rule:
```json
"liga": {
  "ஸ்ரீ": ["$sa_sha", "்", "ர", "ீ"]
}
```
*This generates FEA equivalent to:* `sub [sa sha] virama ra ii by sri;`

### B. Single Substitution (`single`)
Replaces one glyph with another. `sub a by a.alt;`

*   **Key**: The **Output** glyph name.
*   **Value**: Array containing the **Input** glyph name.

```json
"single": {
  "a.alt": ["a"],
  "$groupB": ["$groupA"] // Can map class to class
}
```

### C. Multiple Substitution (`multi`)
Decomposes one glyph into a sequence of glyphs. `sub A by A_part1 A_part2;`

*   **Key**: The **Output Sequence** (comma-separated string).
*   **Value**: Array containing the **Input** glyph name.

```json
"multi": {
  "f,i": ["fi"],     // Decompose ligature
  "n,u,k,t,a": ["nukta_composite"]
}
```

### D. Contextual Substitution (`context`)
Replaces a glyph only when surrounded by specific neighbors. `sub a' b by c;`

*   **Key**: The **Replacement** glyph (what the target becomes).
*   **Value**: Object defining the context.

| Field | Description |
| :--- | :--- |
| `replace` | Array of **Target** glyphs (the ones being changed). |
| `left` | (Optional) Array of glyphs preceding the target (`LookBehind`). |
| `right` | (Optional) Array of glyphs following the target (`LookAhead`). |

**Example:** Replace `sigma` with `sigma_final` only if it's at the end of a word (followed by space).
```json
"context": {
  "sigma_final": {
    "replace": ["sigma"],
    "right": ["space"]
  }
}
```

### E. Distance / Kerning (`dist`)
Used in the `dist` feature (or `kern`) for manual spacing rules.

*   **Simple:** `pos A <0 0 50 0>;` (Adds 50 units of advance width).
    ```json
    "dist": {
      "simple": {
        "A": "50"
      }
    }
    ```
*   **Contextual:** Adjust position based on neighbors.
    ```json
    "dist": {
      "contextual": [
        {
          "target": "T",
          "space": "-100",
          "right": ["o"]
        }
      ]
    }
    ```

---

## 4. Lookups (`lookups`)

Lookups are reusable blocks of rules defined at the root level. They resolve ordering issues (e.g., ensuring reordering happens before ligation).

```json
"lookups": {
  "lookup_pre_processing": {
    "lookupflags": { "IgnoreMarks": "true" },
    "single": { ... }
  }
}
```

### Lookup Flags
You can add flags to features or lookups to control how the engine skips characters.

*   `RightToLeft`
*   `IgnoreBaseGlyphs`
*   `IgnoreLigatures`
*   `IgnoreMarks`
*   `UseMarkFilteringSet`

```json
"lookupflags": {
  "UseMarkFilteringSet": "@virama"
}
```