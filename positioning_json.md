# positioning.json Data Format Guide

The `positioning.json` file controls how combining marks attach to base characters (GPOS) and defines recommended kerning pairs. It allows you to create sophisticated OpenType features without writing raw code.

## Root Structure

The file is an array of objects, each serving a specific configuration purpose.

```json
[
  { "groups": { ... } },
  { "positioning": [ ... ] },
  { "markAttachment": { ... } },
  { "markAttachmentClass": [ ... ] },
  { "baseAttachmentClass": [ ... ] },
  { "recommendedKerning": [ ... ] }
]
```

---

## 1. Groups (`groups`)

Groups define reusable collections of glyphs. This keeps your rules concise. A group name is referenced elsewhere using the `$` prefix (e.g., `$uppercaseVowels`).

*   **Structure:** A key-value object where the key is the group name and the value is an array of glyph names.
*   **Inheritance:** You can reference `nameKey`s from your `characters.json` file here directly (e.g., `$consonants` works automatically if you have a "consonants" set). Defining a group here with the same name overrides the character set definition for positioning purposes.
*   **Expansion:** Groups can contain other groups (e.g., `$uppercaseVowels` inside `$allLetters`).

```json
{
  "groups": {
    "uppercaseVowels": ["A", "E", "I", "O", "U"],
    "accents": ["acute", "grave", "circumflex"],
    "allLetters": ["$uppercaseVowels", "B", "C", "D"] 
  }
}
```

---

## 2. Positioning Rules (`positioning`)

This section defines **WHICH** pairs should be positioned and **HOW** they are processed. A rule must specify either `gpos` (Positioning) OR `gsub` (Substitution/Baking), but not both.

*   **base**: Array of base glyphs (or groups).
*   **mark**: Array of mark glyphs (or groups).
*   **movement**: (Optional) `'horizontal'` or `'vertical'`. Restricts movement to one axis in the editor.

### Mode A: GPOS (Visual Positioning)
Use `gpos` to create OpenType positioning rules (`pos base <anchor> mark <anchor>`). The glyphs remain separate in the font file but are drawn together.

*   **gpos**: The feature tag (e.g., `mark`, `mkmk`, `abvm`, `blwm`).

**Example: Standard Vowel Signs**
```json
{
  "base": ["$consonants"],
  "mark": ["$vowelSigns"],
  "gpos": "abvm"
}
```

### Mode B: GSUB (Baked Ligatures)
Use `gsub` to create a "Baked" ligature. The system will merge the paths of the base and mark into a NEW glyph (e.g., `Ñ`) and write a substitution rule (`sub N tilde by N_tilde`).

*   **gsub**: The feature tag (e.g., `liga`, `ccmp`).

**Example: Baking Accented Characters**
This tells the engine: "When `N` is followed by `tilde`, position them visually, but then BAKE them into a single glyph `Ñ`."
```json
{
  "base": ["N"],
  "mark": ["tilde"],
  "gsub": "liga" 
}
```
*Note: The target glyph (e.g., `Ñ`) must exist in `characters.json` for this to work.*

---

## 3. Mark Attachment Rules (`markAttachment`)

This section defines **WHERE** marks attach to bases. It acts as the "geometry layer".

*   **Structure:** `BaseName -> { MarkName: [BaseAnchor, MarkAnchor, X_Offset, Y_Offset] }`
*   **Inheritance:** You can define rules for groups (e.g., `$uppercaseVowels`) which apply to all members unless overridden by a specific character rule.

### Anchor Points
The system uses a 9-point grid for automatic anchoring:
`topLeft`, `topCenter`, `topRight`
`midLeft`, `center`, `midRight`
`bottomLeft`, `bottomCenter`, `bottomRight`

### The Rule Array
`[BaseAnchor, MarkAnchor, X_Offset, Y_Offset]`

1.  **BaseAnchor:** The point on the **Base** glyph where the mark attaches.
2.  **MarkAnchor:** The point on the **Mark** glyph that snaps to the base.
3.  **X_Offset:** (Optional) Nudge the mark horizontally (positive = right).
4.  **Y_Offset:** (Optional) Nudge the mark vertically (positive = down*).
    *   *Note: Coordinate system Y-axis direction depends on the specific editor view, but generally +Y is down in canvas space.*

**Example:**
"Attach the `acute` accent's `bottomCenter` to the `A`'s `topCenter`. Then move it 10 units up (negative Y)."

```json
"markAttachment": {
  "A": {
    "acute": ["topCenter", "bottomCenter", "0", "-10"]
  },
  "$consonants": {
    "$belowMarks": ["bottomCenter", "topCenter"] 
  }
}
```

---

## 4. Smart Classes (`markAttachmentClass`, `baseAttachmentClass`)

These arrays define synchronization behavior in the editor. If you move a mark for one member of a class, the tool calculates the relative delta and applies it to **all other members** automatically.

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Optional descriptive name for the class. |
| `members` | `string[]` | **Required.** A list of glyphs (or groups) that share positioning logic. |
| `exceptions` | `string[]` | Glyphs in this list are excluded entirely from the class. |
| `applies` | `string[]` | **Filter.** This class only activates if the *other* glyph in the pair is in this list. <br>*(e.g., A Mark Class that only syncs when attached to `BaseGroupA`)*. |
| `exceptPairs` | `string[]` | **Unlinked Pairs.** A list of specific pairs (format `"Base-Mark"`) that should NOT sync. These are treated as manual exceptions. |

**Example:**
A class for upper marks. They sync together, EXCEPT when placed on `i` (which might need a different height).
```json
"markAttachmentClass": [
  {
    "name": "Upper Marks",
    "members": ["acute", "grave", "circumflex"],
    "exceptions": [],
    "applies": ["$uppercaseVowels"], 
    "exceptPairs": ["i-acute", "j-grave"]
  }
]
```

---

## 5. Recommended Kerning (`recommendedKerning`)

This section defines pairs that usually require spacing adjustments. The Kerning Workspace uses this list to populate its "Recommended" tab.

*   **Structure:** An array of pairs `[Left, Right, (Optional) TargetDistance]`.
*   **TargetDistance:**
    *   If omitted or `null`: Defaults to `Left.RSB + Right.LSB`.
    *   `0`: Kern until the glyph bounding boxes touch.
    *   `Number`: Kern until the gap is exactly this many units.

```json
"recommendedKerning": [
  ["A", "V"],          // Auto-calculate
  ["T", "o", "10"],    // Enforce 10 unit gap
  ["$uppercase", "."]  // Kern all uppercase against period
]
```