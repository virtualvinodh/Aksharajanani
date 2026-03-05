# Testing Guide for AksharaJanani

Ensuring the quality and correctness of a font editor is critical, as errors can propagate into the exported font files and affect end-users. This guide outlines the testing strategies and tools available in AksharaJanani.

## 1. Automated Unit Tests

We use **Vitest** for unit testing core logic and services.

### Running Tests
```bash
npm run test
```

### Key Areas Covered
*   **Glyph Rendering:** Verifies that vector paths are correctly generated from data.
*   **OpenType Logic:** Ensures that GSUB/GPOS rules are correctly compiled into FEA syntax.
*   **Data Transformation:** Tests the import/export logic for JSON and OTF files.
*   **Geometry Math:** Validates Bezier curve calculations and intersection logic.

### Writing New Tests
Create a `.test.ts` file alongside the source file (e.g., `src/services/myService.test.ts`).

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myService';

describe('myService', () => {
  it('should calculate correct value', () => {
    const result = myFunction(10);
    expect(result).toBe(20);
  });
});
```

---

## 2. Manual QA Checklist (Test Cases)

The **Test Case Page** (`/test-cases`) is a comprehensive manual QA checklist for validating the entire application's functionality. It covers UI interactions, state management, drawing tools, and more.

### Defining Test Cases
Test cases are defined in `data/test_cases.json`. They are categorized by feature area.

**Structure:**
```json
[
  {
    "id": "init_load_script",
    "category": "App Initialization",
    "description": "Select 'Tamil' script. Verify workspace loads with correct character grid.",
    "priority": "high"
  },
  {
    "id": "nav_mobile_drawer_open",
    "category": "Mobile UI",
    "description": "On mobile viewport, click the floating 'Grid' button. Verify Nav Drawer slides in from left.",
    "priority": "high"
  }
]
```

### Using the Checklist
1.  Navigate to the **Test Cases** page (often accessible via the Command Palette or hidden menu).
2.  Expand a category (e.g., "Drawing Tools", "Settings").
3.  Perform the action described in the test case.
4.  Mark the test as **Pass**, **Fail**, or **Skip**.
5.  Your progress is saved locally, allowing you to track regression testing across sessions.

---

## 3. Font Rendering Validation (Test Page)

The **Font Test Page** is a dedicated playground for testing the actual output of your font.

1.  Open the **Test Font** page.
2.  Type any text into the input area.
3.  Adjust the font size using the slider.
4.  Verify that:
    *   Ligatures are forming correctly.
    *   Marks are positioned accurately.
    *   Kerning is applied as expected.

---

## 3. Glyph Consistency (Comparison View)

The **Comparison View** allows you to select a specific set of glyphs and view them side-by-side in a grid. This is useful for checking consistency in stroke thickness, height, and alignment across a group of related characters (e.g., all uppercase vowels).

1.  Open the **Comparison** tab.
2.  Use the sidebar to select specific characters or entire categories (e.g., "Vowels").
3.  The main view renders the selected glyphs in a responsive grid.
4.  Use the **Fold Lines** toggle to switch between a wrapped grid and a single continuous line.
5.  Use this to check:
    *   **Consistency:** Do all glyphs share the same stroke weight?
    *   **Alignment:** Are they sitting correctly on the baseline and top line?
    *   **Scale:** Are the glyphs proportional to each other?

---

## 4. End-to-End (E2E) Testing

*Currently, we do not have automated E2E tests (e.g., Cypress/Playwright). Contributions in this area are welcome!*


---

## 5. Reporting Bugs

If you find a bug, please open an issue on GitHub with:
1.  **Steps to Reproduce:** Clear, numbered list.
2.  **Expected Behavior:** What should have happened.
3.  **Actual Behavior:** What actually happened.
4.  **Screenshots/Video:** Visual proof is extremely helpful for UI bugs.
5.  **Project Export:** If possible, attach the `.json` export of the project where the issue occurs.
