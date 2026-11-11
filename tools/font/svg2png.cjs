// Render an SVG (e.g. from glyphsvg.py) to PNG.
//   node tools/font/svg2png.cjs glyphs.svg glyphs.png [width] [height]
const { chromium, launchOptions } = require('../lib/browser.cjs');
const path = require('path');
(async () => {
    const [src, dest, w, h] = process.argv.slice(2);
    if (!src || !dest) { console.error('usage: svg2png.cjs in.svg out.png [width] [height]'); process.exit(2); }
    const browser = await chromium.launch(launchOptions());
    const page = await browser.newPage({ viewport: { width: +w || 1300, height: +h || 240 } });
    await page.goto('file://' + path.resolve(src));
    await page.screenshot({ path: dest });
    await browser.close();
})();
