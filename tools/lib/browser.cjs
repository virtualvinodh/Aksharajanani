// Shared browser setup for the tools.
//
// Playwright isn't a dependency of the app. Install it once (not saved to package.json):
//   npm i --no-save playwright && npx playwright install chromium
// CHROME_PATH=/path/to/chrome uses a specific Chromium build instead of Playwright's own.
let playwright;
try {
    playwright = require('playwright');
} catch {
    console.error('Playwright is missing: npm i --no-save playwright && npx playwright install chromium');
    process.exit(1);
}

/** Options for chromium.launch / launchPersistentContext. */
const launchOptions = (extra = {}) => ({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    ...extra,
});

/** The app under test: `npm run dev` (port 3000) by default, or e.g. BASE=http://localhost:4173/ for `npm run preview`. */
const BASE = process.env.BASE || 'http://localhost:3000/';

/** Close any tips/hints the app shows (they're part of a normal first run). */
async function dismissTips(page) {
    for (let i = 0; i < 3; i++) {
        const ok = page.locator('button[data-action="close"], button[data-action="skip"], button:text-is("CLOSE"), button:text-is("OK")');
        if (!(await ok.count())) break;
        await ok.first().click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(300);
    }
}

/** Drag through `pts` (fractions 0–1 of the largest element matching `canvasSel`). */
async function drag(page, canvasSel, pts) {
    const boxes = await page.$$eval(canvasSel, cs => cs.map(c => c.getBoundingClientRect().toJSON()));
    const box = boxes.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const P = ([x, y]) => [box.x + x * box.width, box.y + y * box.height];
    await page.mouse.move(...P(pts[0]));
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...P(p), { steps: 8 });
    await page.mouse.up();
}

module.exports = { chromium: playwright.chromium, launchOptions, BASE, dismissTips, drag };
