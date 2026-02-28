# Virtual vs. Baked Characters: Logic Matrix

This document outlines how the system interprets the combinations of `glyphClass`, construction properties (`position`, `kern`), and OpenType tags (`gpos`, `gsub`) to determine whether to **Bake Geometry** (create a new shape) or **Generate Code** (create an OpenType rule).

---

## Definitions

1.  **Baking (FontService):** The process of physically merging vector paths from component glyphs into a new, permanent glyph outline in the `.otf` file. This requires a Unicode codepoint (standard or PUA).
2.  **Virtual (`glyphClass: 'virtual'`):** A flag indicating the character is a logic container only. It has no Unicode, no geometry in the final font, and is used strictly to generate FEA rules.
3.  **Concrete (`glyphClass: 'base' | 'ligature' | 'mark'`):** A standard character that will exist in the font file with geometry.
4.  **Inference:** The system's attempt to guess the correct Feature Tag if one is not explicitly provided.

---

## 1. Positioning Logic (`position: [Base, Mark]`)

This table explains what happens when a character is defined with a `position` pair.

| Case | `glyphClass` | Tags | FontService (Baking) | FEA Service (Code) | Resulting Behavior | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `virtual` | None | **Skipped** | Infers `mark` or `mkmk`. Generates `pos base <anchor> mark <anchor>`. | **Standard Positioning.** Typing Base + Mark moves the mark visually. No new glyph is substituted. | ✅ **Standard** |
| **2** | `virtual` | `gpos: 'abvm'` | **Skipped** | Generates `pos` rule inside `feature abvm`. | **Specific Positioning.** Same as above, but scoped to a specific feature. | ✅ **Valid** |
| **3** | `virtual` | `gsub: 'liga'` | **Skipped** | Generates `sub Base Mark by Name`. | **Invisible Substitution.** The engine substitutes Base+Mark with "Name", but "Name" has no outline (because it is virtual). Text disappears. | ❌ **Invalid** |
| **4** | `virtual` | `gpos` + `gsub` | **Skipped** | Generates **BOTH** rules. | **Conflict.** The engine might try to position them AND substitute them. Usually, GSUB takes precedence, resulting in invisible text (see Case 3). | ❌ **Invalid** |
| **5** | `ligature` | None | **Bakes Geometry** | **No Rule.** | **Orphaned Glyph.** A new glyph is created in the font, but no OpenType rule maps to it. It cannot be typed unless a rule is added manually. | ⚠️ **Warning** |
| **6** | `ligature` | `gsub: 'liga'` | **Bakes Geometry** | Generates `sub Base Mark by Name` inside `feature liga`. | **Standard Ligature.** Typing Base + Mark replaces them with a single new glyph containing the merged shapes. | ✅ **Standard** |
| **7** | `ligature` | `gpos: 'mark'` | **Bakes Geometry** | Generates `pos base <anchor> mark <anchor>`. | **Redundant/Confusing.** A new glyph is baked (wasting file size), but the font engine executes a Move command on the original components. The baked glyph is never used. | ⚠️ **Inefficient** |
| **8** | `base` | None | **Bakes Geometry** | **No Rule.** | **Pre-composed Character.** A new glyph is created. It must be typed directly (via keyboard or palette) or referenced by *other* rules. It does not automatically substitute. | ✅ **Valid** |

---

## 2. Kerning Logic (`kern: [Left, Right]`)

This table explains what happens when a character is defined with a `kern` pair.

| Case | `glyphClass` | Tags | FontService (Baking) | FEA Service (Code) | Resulting Behavior | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `virtual` | None | **Skipped** | Infers `kern` / `dist`. Generates `pos Left Right <value>`. | **Standard Kerning.** Typing Left then Right adjusts the spacing between them. | ✅ **Standard** |
| **2** | `virtual` | `gpos: 'dist'` | **Skipped** | Generates `pos` rule inside `feature dist`. | **Distance Adjustment.** Used for script-specific spacing (e.g., Indic). | ✅ **Valid** |
| **3** | `virtual` | `gsub` | **Skipped** | Generates `sub Left Right by Name`. | **Invisible Substitution.** Replaces the pair with a ghost glyph. Text disappears. | ❌ **Invalid** |
| **4** | `ligature` | `gsub: 'liga'` | **Bakes Geometry** | Generates `sub Left Right by Name`. | **Fused Ligature.** Visual result looks like kerning, but it is actually a substitution of a single baked glyph. Useful for connecting scripts or "touching" kerning. | ✅ **Valid** |
| **5** | `ligature` | `gpos: 'kern'` | **Bakes Geometry** | Generates `pos Left Right <value>`. | **Redundant.** A fused glyph is created but never used. The system just kerns the originals. | ⚠️ **Inefficient** |

---

## 3. Explicit Ligature Logic (`liga: [A, B, C]`)

This logic applies when the `liga` array is explicitly defined.

| Case | `glyphClass` | Tags | FontService (Baking) | FEA Service (Code) | Resulting Behavior | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `ligature` | None | **Bakes** (if `composite` set) | **No Rule.** | **Orphaned Glyph.** A new glyph is created but never substituted. | ⚠️ **Warning** |
| **2** | `ligature` | `gsub: 'liga'` | **Bakes** | Generates `sub A B C by Name`. | **Standard Ligature.** | ✅ **Standard** |
| **3** | `virtual` | `gsub: 'liga'` | **Skipped** | Generates `sub A B C by Name`. | **Invisible Substitution.** The sequence is replaced by a glyph with no outlines. | ❌ **Invalid** |

---

## 4. GSUB Generation Precedence

When generating substitution rules (GSUB), the system checks character properties in a specific order. Once a match is found for a specific feature tag, it generates the rule and stops checking further properties for that character.

**Prerequisite:** `char.gsub` must equal the current feature tag (e.g., `'liga'`, `'akhn'`) being processed.

1.  **Explicit `liga` Property**
    *   *Input:* `char.liga` (Array of component names).
    *   *Rule:* `sub [liga components] by [char name];`
    *   *Use Case:* Complex ligatures with 3+ components or components different from the visual construction.

2.  **Positioning Pair (`position` + No GPOS)**
    *   *Input:* `char.position` (Tuple: `[Base, Mark]`).
    *   *Condition:* `!char.gpos` (Must not have a GPOS tag defined).
    *   *Rule:* `sub Base Mark by [char name];`
    *   *Use Case:* "Baked" positioning where the result is a single pre-composed glyph (e.g., Indic conjuncts `ka`+`virama` -> `k_virama`).

3.  **Kerning Pair (`kern` + No GPOS)**
    *   *Input:* `char.kern` (Tuple: `[Left, Right]`).
    *   *Condition:* `!char.gpos` (Must not have a GPOS tag defined, which would imply distance positioning).
    *   *Rule:* `sub Left Right by [char name];`
    *   *Use Case:* Fused ligatures created via the kerning tool interface (e.g., `A` + `V` -> `AV` ligature).

4.  **Visual Components (`composite` or `link`)**
    *   *Input:* `char.composite` OR `char.link`.
    *   *Rule:* `sub [components] by [char name];`
    *   *Use Case:* Standard ligatures where the logical components match the visual components (e.g., `f` + `i` -> `fi`).

---

## 5. Summary of Invalid Configurations

1.  **Virtual + GSUB (`gsub` tag present):**
    *   *Why:* Virtual glyphs have no geometry. Substituting existing characters with a virtual character deletes them visually.
    *   *Fix:* Change `glyphClass` to `ligature` if you want a substitution, or remove the `gsub` tag/property if you want positioning.

2.  **Concrete (Base/Ligature) + GPOS (`gpos` tag present):**
    *   *Why:* You are baking a complex shape into the font file (increasing size) but telling the font engine to move the *original* components instead of using your new shape.
    *   *Fix:* Either change `glyphClass` to `virtual` (if you just want positioning), or remove the `gpos` tag (if you want the fused shape to appear).

3.  **Virtual + No Positioning/Kerning Data:**
    *   *Why:* A virtual character needs logic to exist. If it has no `position` or `kern` array, it generates no FEA code and serves no purpose.

4.  **Mark Class + Non-Zero Advance Width:**
    *   *Why:* While not strictly a "Virtual" error, marks intended for GPOS should usually have `advWidth: 0` to prevent them from pushing subsequent characters forward.

5.  **Ligature + No GSUB Tag:**
    *   *Why:* The system does **not** auto-infer `gsub: 'liga'` for concrete ligatures. If you create a ligature but don't set the `gsub` property, the glyph is exported but no substitution rule is written. The user cannot type it.
