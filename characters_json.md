
#### Transform Details (`compositeTransform`)

This array configures exactly how each component is placed. The index in this array matches the index in `composite` or `link`.

**Structure:** Array:`[{ scale: 1, rotation: 0, x: 0, y: 0, mode: 'relative' }, ...]`

**Order of Operations:**
Transforms are applied to the component in the following specific order:
1.  **Pivot:** The component is anchored at the **center** of its visual bounding box.
2.  **Scale:** The component is scaled relative to its center.
3.  **Rotation:** The component is rotated (in degrees) around its center.
4.  **Translation:** The transformed shape is moved by the `x` and `y` values (combined with any automatic offsets determined by the `mode`).

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
