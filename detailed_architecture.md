# Aksharajanani: Engineering Manual (V16.0)

This document specifies the mathematical transformations and low-level algorithms used in the font engine.

---

## 1. Geometric Constants & Math

### A. Coordinate Mapping
Canvas $Y$ (top-down) to Font $Y$ (bottom-up):
$$y_{font} = ((1000 - y_{canvas}) \times (\frac{UPM}{1000})) + Descender$$

### B. Vector Expansion (Monoline)
- **Miter Limit**: `5`. Caps sharp corner "spikes" during polyline-to-outline expansion.
- **Terminal Smoothing**: A 4-point lookahead/lookbehind window is used to stabilize tangents at the start and end of strokes.

### C. Slice Tool Densification
The Slice Tool injects vertices every **4px** along the cut edge. This "anchors" the new geometry against the global path smoothing algorithm, ensuring cut edges remain straight.

---

## 2. Logic & Sanitization

### A. Identifier Sanitization (Adobe Spec)
All user-defined names (Groups, Classes, Lookups) are processed by `sanitizeIdentifier`:
1.  Spaces and hyphens are replaced with underscores (`_`).
2.  All characters outside `[a-zA-Z0-9_]` are removed.
3.  Leading numerals are stripped (e.g., `1_Consonant` becomes `_Consonant`).

### B. Cache Invalidation (cyrb53 Hashing)
The generator uses a non-cryptographic `cyrb53` hash to identify project states. The hash is calculated from the serialized JSON string of the project. If the hash is found in IndexedDB, the current font binary is considered "Fresh" and no recompilation occurs.

### C. Semantic Vertical Centering (UX)
Character previews are vertically centered **unless** they belong to specific Unicode categories:
- **Non-Spacing/Combining Marks** (`Mn`, `Mc`, `Me`)
- **Modifiers** (`Lm`, `Sk`)
- **Punctuation** (`P*`)
These categories remain baseline-relative to preserve their semantic position.

---

## 3. PUA & CMAP Engineering

### A. Atomic PUA Cursor Jump
To avoid collisions with CJK Compatibility and OS-reserved blocks:
1.  **Range 1**: `U+E000` to `U+F8FF` (BMP).
2.  **Jump**: If Range 1 is exhausted, the cursor jumps to **Plane 15** (`U+F0000`).
3.  **Format 12 Patching**: The Python worker injects Segmented Coverage subtables to support Plane 15 glyphs in standard OS environments.

### B. Position Propagation Math
When syncing an `AttachmentClass`, the engine calculates a **joint delta**:
$$\Delta_{joint} = (Offset_{source} + Anchor_{mark}) - Anchor_{base}$$
This delta is then reapplied to siblings to account for varying base character widths.

---

## 4. Creator Studio Pipeline
- **Hi-Res Sampling**: Renders at **2160px** (4K equivalent). Coordinates are scaled by $2.16\times$.
- **Watermark**: Injected at coordinate **97.5%** with a **15px shadow blur** directly into the canvas pixel buffer.