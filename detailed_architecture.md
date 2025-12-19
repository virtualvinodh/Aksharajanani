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

## 2. Advanced Algorithms

### A. Inversion-Subtraction Tracing
To handle internal counters (holes) in raster images:
1.  **Trace**: Generate raw paths via `ImageTracer.js`.
2.  **Unite**: Geometric union of all paths in an isolated `paper.PaperScope`.
3.  **Invert**: Subtract the unified shape from the viewport bounding box rectangle.
4.  **Extract**: Discard the outermost path (frame); remaining paths form the manifold outline.

### B. Kerning Binary Search
Finds the most negative value that maintains the `targetDistance` specifically in the **X-Height Zone** ($baseline < y \le xHeight$), while checking for hard collisions in the Ascender and Descender zones.

---

## 3. PUA & CMAP Engineering

### A. Atomic PUA Cursor Jump
To avoid collisions with CJK Compatibility and OS-reserved blocks:
1.  **Range 1**: `U+E000` to `U+F8FF` (BMP).
2.  **Jump**: If Range 1 is exhausted, the cursor jumps to **Plane 15** (`U+F0000`).
3.  **Format 12 Patching**: The Python worker injects Segmented Coverage subtables to support Plane 15 glyphs in standard OS environments.

### B. Cache Hashing
Font binaries are cached in IndexedDB using a **53-bit cyrb53 hash** of the `ProjectData`. Any modification to glyphs, metrics, or rules invalidates the hash.

---

## 4. Creator Studio Pipeline
- **Hi-Res Sampling**: Renders at **2160px** (4K equivalent). Coordinates are scaled by $2.16\times$.
- **Watermark**: Injected at coordinate **97.5%** with a **15px shadow blur** directly into the canvas pixel buffer.
