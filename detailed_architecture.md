# Aksharajanani: Engineering Manual (V16.0)

This document specifies the mathematical transformations and low-level algorithms used in the font engine.

---

## 1. Geometric Constants & Math

### A. Coordinate Mapping
Canvas $Y$ (top-down, origin 0,0 top-left) to Font $Y$ (bottom-up, origin baseline):
$$y_{font} = ((1000 - y_{canvas}) \times (\frac{UPM}{1000})) + Descender$$

### B. GPOS Anchor Generation
Final anchors in the FEA code are derived by combining the static `AttachmentPoint` ($A$) with the dynamic offset ($O$) stored in the `markPositioningMap`:

$$\text{Anchor}_{X} = (A_{base,x} + O_{x}) \times \text{Scale}$$
$$\text{Anchor}_{Y} = (A_{base,y} + O_{y}) \times \text{Scale}$$

Where $O$ is the delta between the original mark origin and its positioned state on the 1000px canvas.

### C. Vector Expansion
- **Terminal Smoothing**: A 4-point lookahead/lookbehind window stabilizes tangents at the start/end of strokes, preventing "flaring" caused by small input hooks.
- **Slice Tool Densification**: Injects vertices every **4px** along new edges to "anchor" geometry against smoothing algorithms, ensuring cut chords remain straight.

### D. Path Boolean Operations
Aksharajanani utilizes the `evenodd` winding rule via Paper.js to resolve overlapping paths during export. 
- **Union**: All independent strokes are united into a single `CompoundPath`.
- **Simplification**: Post-union, paths are simplified using the **Ramer-Douglas-Peucker** algorithm to minimize control point overhead in the final OTF.

---

## 2. Logic & Sanitization

### A. Identifier Sanitization (Adobe Spec)
All user-defined names (Groups, Classes, Lookups) are processed by `sanitizeIdentifier` for FEA compliance:
1.  Spaces/hyphens $\rightarrow$ underscores (`_`).
2.  Non-alphanumerics are stripped.
3.  Leading numerals are removed.

### B. Deletion: Bake & Sever
When a source glyph is deleted, the engine performs a "Bake & Sever" routine on all dependent linked glyphs:
1.  **Bake**: The current visual state of the component is flattened into independent paths.
2.  **Sever**: The `link` metadata is removed, converting the dependent glyph into a static base drawing.

---

## 3. PUA & CMAP Engineering

### A. Atomic PUA Cursor Jump
To prevent collisions with OS-reserved blocks:
1.  **BMP Range**: `U+E000` to `U+F8FF`.
2.  **Overflow Jump**: If the cursor exceeds `U+F8FF`, it automatically jumps to **Plane 15** (`U+F0000`).
3.  **Format 12 Patching**: Since Opentype.js defaults to Format 4 (BMP only), the Python worker injects a Format 12 subtable to provide cross-platform support for Plane 15 glyphs.

### B. Cache Invalidation (cyrb53)
The system uses the **cyrb53** non-cryptographic hash to generate a 64-bit fingerprint of the `ProjectData`.
- **Logic**: Any change to glyph paths, positioning rules, or font metrics results in a new hash, triggering a full re-compilation on the next Export/Test request.

---

## 4. Just-In-Time (JIT) Group Expansion
To maintain a small file size, group references (e.g., `@consonants`) are stored as strings. The `groupExpansionService` uses a recursive visitor pattern:
1.  **Lookup**: If key starts with `@`, search `fontRules.groups`.
2.  **Fallback**: If key starts with `$`, search `characterSets.nameKey`.
3.  **Recursion**: If a member is itself a group, recurse until a base glyph name is found.
4.  **Deduplication**: Final arrays are passed through a `Set` to ensure unique glyph name output for the FEA compiler.