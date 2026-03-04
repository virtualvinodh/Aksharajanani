# AksharaJanani (Font Builder)

A professional-grade, browser-based font creation suite built with React, TypeScript, and Tailwind CSS. AksharaJanani empowers designers to create complex OpenType fonts with support for advanced features like Kerning, Glyph Positioning (GPOS), and custom OpenType rules (GSUB).

## 🚀 Key Features

### 1. Vector Glyph Editor
*   **Precision Drawing:** Full Bezier curve editing with `paper.js` integration.
*   **Component System:** Build complex glyphs from reusable components (e.g., base letters + diacritics).
*   **Image Tracing:** Import images and trace them into vector paths.
*   **Unified Editor:** Seamlessly switch between drawing, components, and properties.

### 2. Advanced OpenType Support
*   **Rule Editor:** Write and edit raw OpenType Feature File syntax (`.fea`).
*   **GSUB (Glyph Substitution):**
    *   **Ligatures:** Automatic generation of standard ligatures (`liga`).
    *   **Contextual Alternates:** Define complex substitution rules.
    *   **Indic Support:** Specialized logic for `akhn` (Akhand) and other Indic features.
*   **GPOS (Glyph Positioning):**
    *   **Anchor-Based Positioning:** Visually place anchors for precise mark-to-base and mark-to-mark positioning (`mark`, `mkmk`).
    *   **Cursive Attachment:** Support for cursive scripts (`curs`).
    *   **Heuristics:** Auto-inference of positioning based on glyph geometry.

### 3. Professional Kerning
*   **Visual Kerning Editor:** Adjust spacing between glyph pairs in real-time.
*   **Class-Based Kerning:** Group similar glyphs for efficient spacing management.
*   **Auto-Kerning:** Algorithmic suggestions for optimal spacing.
*   **Exception Handling:** Define specific overrides for unique pairs.

### 4. Project Management
*   **Multi-Script Support:** Native support for Latin, Devanagari, Tamil, and other scripts.
*   **Import/Export:**
    *   Import existing `.otf` / `.ttf` fonts.
    *   Export production-ready OpenType fonts.
    *   Import/Export glyphs as SVG.
*   **Local Storage:** Robust persistence using IndexedDB (`idb`) ensures your work is saved automatically.
*   **Version Control:** Snapshot and restore functionality.

### 5. Testing & Preview
*   **Live Preview:** Type and test your font immediately within the app.
*   **Test Cases:** Define specific text strings to validate complex rendering rules.
*   **Comparison View:** Compare your font against system fonts or other versions.

## 🛠️ Technical Stack

*   **Frontend Framework:** React 18
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS
*   **Font Engine:** `opentype.js`
*   **Vector Engine:** `paper.js`
*   **Storage:** IndexedDB (via `idb`)
*   **Virtualization:** `react-virtuoso` (for handling large character sets)
*   **Icons:** `lucide-react`

## 📂 Project Structure

```
/src
  /components       # UI Components (Editors, Modals, Toolbars)
    /drawing        # Drawing-specific components
    /kerning        # Kerning-specific components
    /positioning    # Positioning-specific components
    /rules          # Rule editor components
  /contexts         # React Contexts (Global State)
  /services         # Core Logic & Algorithms
    feaService.ts   # OpenType Feature File parser/generator
    fontService.ts  # Font export/import logic
    glyphRender...  # Rendering logic
  /utils            # Helper functions (Geometry, Path manipulation)
  /types            # TypeScript definitions
```

## ⚡ Getting Started

### Prerequisites
*   Node.js (v18 or higher)
*   npm

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-org/aksharajanani.git
    cd aksharajanani
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  **Open the app:**
    Navigate to `http://localhost:3000` in your browser.

## 📖 Usage Workflow

1.  **Create Project:** Start a new project and select your target scripts (e.g., Latin, Devanagari).
2.  **Draw Glyphs:** Double-click a grid cell to open the editor. Draw paths or import SVGs.
3.  **Define Components:** Use "Add Component" to reuse existing glyphs (e.g., using 'A' in 'Á').
4.  **Set Positioning:** Go to the **Positioning** tab to place anchors for marks.
5.  **Adjust Kerning:** Switch to the **Kerning** tab to fine-tune spacing.
6.  **Write Rules:** (Optional) Use the **Rules** tab to define custom OpenType features.
7.  **Export:** Click the Export button to generate your `.otf` file.

## 🤝 Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for details on how to submit pull requests, report issues, and suggest improvements.

## 📄 License

This project is licensed under the MIT License. See `LICENSE` for more details.
