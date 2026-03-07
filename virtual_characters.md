# Virtual vs. Baked Characters: Logic Matrix

This document outlines how the system interprets the combinations of `glyphClass`, construction properties (`position`, `kern`, `composite`, `link`), and OpenType tags (`gpos`, `gsub`) to determine whether to **Bake Geometry** (create a new shape) or **Generate Code** (create an OpenType rule).

---

## The Core Philosophy
**Visual construction arrays (`composite`, `link`, `position`, `kern`) dictate *only* how a glyph is drawn and baked. They NEVER automatically generate OpenType rules.**

OpenType rules are generated *exclusively* by explicit, dedicated properties (`liga` for GSUB, and `gpos`/`gsub` tags).

---

## 1. Baking Logic (Font Creation)
*Baking is determined entirely by the `glyphClass`.*

| `glyphClass` | Action | Source Data Used | Result |
| :--- | :--- | :--- | :--- |
| `virtual` | **Skipped** | None | No physical glyph is added to the font file. |
| `base`, `ligature`, `mark` | **Bakes Geometry** | `composite`, `link`, `position`, or `kern` | A permanent glyph outline is created in the font file. |

---

## 2. OpenType Logic (Rule Generation)
*Rule generation is triggered exclusively by specific data arrays (`liga`, `position`, `kern`). Visual arrays (`composite`, `link`) never trigger rules.*

| Rule Type | Trigger (Required Data) | Tag Inference (If Tag is Empty) | Action |
| :--- | :--- | :--- | :--- |
| **GSUB** (Substitution) | `liga` array has items AND `glyphClass` is not `virtual` | Infers `gsub` tag (`liga`, `akhn`, `abvs`, etc.) based on script and `liga` components. | Generates `sub [liga components] by [name];` inside the `gsub` feature. |
| **GPOS** (Positioning) | `position` array has items | If `glyphClass` is `virtual`: Infers `gpos` tag (`mark` or `mkmk`) based on component classes. | Generates anchor attachment rules inside the `gpos` feature. |
| **GPOS** (Kerning) | `kern` array has items | If `glyphClass` is `virtual`: Infers `gpos` tag (`kern` or `dist`) based on script. | Generates kerning value rules inside the `gpos` feature. |

---

## 3. Common Scenarios (How the rules apply in practice)

This table demonstrates how the strict separation of Baking and Logic handles common user intents without the need for complex conflict resolution.

| User Intent | Setup | Resulting Behavior |
| :--- | :--- | :--- |
| **Standard Ligature** (e.g., `fi`) | `glyphClass: 'ligature'`<br>`composite: ['f', 'i']`<br>`liga: ['f', 'i']` | **Bakes** the `fi` shape.<br>**Infers** `gsub: 'liga'`.<br>**Generates** substitution rule. |
| **Standard Mark Positioning** (e.g., `A` + `acute`) | `glyphClass: 'virtual'`<br>`position: ['A', 'acute']` | **Skips** baking.<br>**Infers** `gpos: 'mark'`.<br>**Generates** anchor positioning rule. |
| **Bake Positioned Glyph (No Rules)** (e.g., pre-composed `Aacute`) | `glyphClass: 'base'`<br>`position: ['A', 'acute']` | **Bakes** the `Aacute` shape.<br>**No Inference** (because `liga` is empty and it's not `virtual`).<br>**Generates NO rules.** |
| **Fused Kerning Ligature** (e.g., touching `AV`) | `glyphClass: 'ligature'`<br>`kern: ['A', 'V']`<br>`liga: ['A', 'V']` | **Bakes** the fused `AV` shape.<br>**Infers** `gsub: 'liga'`.<br>**Generates** substitution rule. |
| **Standard Kerning** (e.g., spacing `A` and `V`) | `glyphClass: 'virtual'`<br>`kern: ['A', 'V']` | **Skips** baking.<br>**Infers** `gpos: 'kern'`.<br>**Generates** kerning value rule. |
| ⚠️ **Redundant Setup** (Baked + GPOS) | `glyphClass: 'base'`<br>`position: ['A', 'acute']`<br>`gpos: 'mark'` | **Bakes** the `Aacute` shape.<br>**Generates** anchor positioning rule.<br>*Result:* The font engine moves the original components and ignores the newly baked shape (wasting file size). |
| ✅ **Dormant Rule** (Virtual + GSUB backup) | `glyphClass: 'virtual'`<br>`liga: ['A', 'B']` | **Skips** baking.<br>**Ignores** substitution rule.<br>*Result:* Safe metadata storage. The `liga` array stays dormant until the glyph is detached/converted to a ligature. |
| ❌ **Double Duty** (GSUB + GPOS) | `glyphClass: 'ligature'`<br>`liga: ['A', 'acute']`<br>`position: ['A', 'acute']`<br>`gpos: 'mark'` | **Bakes** the shape.<br>**Generates** substitution rule AND anchor positioning rule.<br>*Result:* The font engine receives conflicting instructions. Usually, GSUB wins, making the GPOS rule dead weight. |
