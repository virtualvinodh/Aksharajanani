// End-to-end: build a complete font in the app (draw every glyph, position marks, space pairs),
// try it in Test and Creator, export it, then show the exported font. Optionally recorded.
//
//   node tools/e2e/e2e.cjs                  English, against BASE (default: npm run dev on :3000)
//   SCRIPT=spanish VIDEO=1 node tools/e2e/e2e.cjs
//   DEBUG_GLYPHS=D,t SCRIPT=spanish node tools/e2e/e2e.cjs   only draw these, one screenshot each
//
// Output: tools/e2e/out/<script>/ (numbered screenshots, <script>.otf, <script>-studio.png,
// summary.json, and <script>.webm with VIDEO=1). See tools/README.md.
const { chromium, launchOptions, BASE } = require('../lib/browser.cjs');
const { G } = require('./alphabet.cjs');
const fs = require('fs'), path = require('path');
const SCRIPT = process.env.SCRIPT || 'english';
const TILE = { english: /English$/, spanish: /Spanish$/ }[SCRIPT];
const SAMPLE = {
    english: 'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.\nAVATAR  Wave  Type  LOVE  Toy',
    spanish: 'El pingüino Wenceslao hizo kilómetros bajo exhaustiva lluvia y frío,\nañoraba a su querido cachorro. ÑANDÚ  Árbol  Ícono  Óvalo  Último',
}[SCRIPT];
const OUT = path.join(__dirname, 'out', SCRIPT);
const REPO = path.resolve(__dirname, '../..');
const DATA_ID = { english: 'latin', spanish: 'spanish' }[SCRIPT];
const en = JSON.parse(fs.readFileSync(`${REPO}/locales/en.json`, 'utf8'));
const sets = [...JSON.parse(fs.readFileSync(`${REPO}/data/characters_${DATA_ID}.json`, 'utf8')), ...JSON.parse(fs.readFileSync(`${REPO}/data/characters_basic.json`, 'utf8'))]
    .filter(st => st.characters);
const ORDER = sets.flatMap(st => st.characters.map(c => ({ name: c.name, set: en[st.nameKey] || st.nameKey, positioned: !!c.position })));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[${SCRIPT}]`, ...a);

(async () => {
    const browser = await chromium.launch(launchOptions());
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 }, acceptDownloads: true,
        ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } } : {}),
    });
    await ctx.addInitScript(() => { try { localStorage.setItem('themePreference', 'light'); localStorage.setItem('donateNoticeDismissed', 'true'); localStorage.setItem('tutorial_dismissed', 'true'); } catch { /* storage blocked */ } });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000); global.__page = p;
    const errors = []; p.on('pageerror', e => errors.push(e.message.slice(0, 200))); p.on('dialog', d => d.accept());
    const shot = (n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });

    // On-screen caption so the video explains each step.
    const caption = async (text) => {
        log(text);
        await p.evaluate((t) => {
            let el = document.getElementById('__e2e_caption');
            if (!el) {
                el = document.createElement('div'); el.id = '__e2e_caption';
                Object.assign(el.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647, pointerEvents: 'none', background: 'rgba(17,24,39,.88)', color: '#fff', font: '600 15px/1.35 system-ui, sans-serif', padding: '8px 12px', borderRadius: '8px', maxWidth: '640px' });
                document.body.appendChild(el);
            }
            el.textContent = t;
        }, text).catch(() => {});
    };
    // Close any tips/hints that pop up (they are part of a normal first run).
    let celebrated = false;
    const closeTips = async () => {
        // The app celebrates when every glyph is done; continue to spacing from there.
        const fineTune = p.getByText('Fine-tune Spacing', { exact: true }).first();
        if (await fineTune.isVisible().catch(() => false)) {
            celebrated = true;
            await caption('Every glyph is done: the app says the font is ready. Continue to fine-tune spacing');
            await p.waitForTimeout(2500); await shot('06-font-ready');
            await fineTune.click().catch(() => {}); await p.waitForTimeout(1500);
        }
        for (let i = 0; i < 4; i++) {
            const btn = p.locator('[data-tutorial-tooltip] button[data-action="close"], [data-tutorial-tooltip] button[data-action="skip"], [data-tutorial-tooltip] button[data-action="primary"]').last();
            if (!(await btn.count())) break;
            await btn.click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(250);
        }
    };
    const canvasBox = async () => (await p.$$eval('canvas', cs => cs.map(c => c.getBoundingClientRect().toJSON()))).sort((a, c) => c.width * c.height - a.width * a.height)[0];
    const tipOpen = async () => (await p.locator('[data-tutorial-tooltip]').count()) > 0;
    const canvasCursor = () => p.$eval('[data-tour="drawing-canvas"]', c => c.style.cursor).catch(() => '');
    const stroke1 = async (pts) => {
        await p.mouse.move(...pts[0]); await p.waitForTimeout(40);
        // The glyph's spacing lines grab any drag that starts on them, even with the pen. If the
        // start point is on one (cursor turns into ↔), draw the stroke from its other end.
        if ((await canvasCursor()) === 'col-resize') { pts = [...pts].reverse(); await p.mouse.move(...pts[0]); await p.waitForTimeout(40); }
        await p.mouse.down();
        for (const pt of pts.slice(1)) await p.mouse.move(...pt, { steps: 4 });
        await p.mouse.up(); await p.waitForTimeout(60);
    };
    const drawGlyph = async (name) => {
        const box = await canvasBox(); const s = box.width / 1000;
        for (const stroke of G[name]) {
            const pts = stroke.map(([x, y]) => [box.x + (500 + x) * s, box.y + y * s]);
            if (await tipOpen()) await closeTips();
            await stroke1(pts);
            // A tip that opened mid-stroke swallows the rest of it: dismiss it and draw that stroke again
            // (if it had landed, the redraw lies exactly on top of it).
            if (await tipOpen()) { await closeTips(); await stroke1(pts); }
        }
        await p.waitForTimeout(1100);
        if (await tipOpen()) await closeTips();
    };
    const back = async () => {
        await closeTips();
        const b = p.locator('[data-tour="header-back"], button:has-text("Back")').first();
        if (await b.isVisible().catch(() => false)) { await b.click(); await p.waitForTimeout(1200); await closeTips(); }
    };
    // Both the drawing and the positioning editor centre their title between the prev/next arrows.
    const navRow = () => p.locator('div.flex-1.flex.justify-center.items-center').filter({ has: p.locator('h2') }).first();

    // 1. Start a project
    await p.goto(BASE); await p.waitForTimeout(2500);
    await caption(`Start a new ${SCRIPT === 'english' ? 'English' : 'Spanish'} font`);
    await p.waitForTimeout(1200);
    await p.getByRole('button', { name: TILE }).first().click(); await p.waitForTimeout(3000); await closeTips();
    await shot('01-grid');

    // Open a glyph from the grid (its set's tab first, since the grid only renders what's near).
    const openGlyph = async (item) => {
        const sel = `[data-tour=${JSON.stringify('grid-item-' + item.name)}]`;
        let tile = p.locator(sel).first();
        if (!(await tile.isVisible().catch(() => false))) {
            await p.getByRole('button', { name: item.set, exact: true }).first().click().catch(() => {});
            await p.waitForTimeout(700);
        }
        tile = p.locator(sel).first();
        await tile.scrollIntoViewIfNeeded().catch(() => {});
        await tile.click(); await p.waitForTimeout(1300); await closeTips();
    };
    const title = async () => (await navRow().locator('h2').first().innerText().catch(() => '')).trim();

    if (process.env.DEBUG_GLYPHS) {
        for (const name of process.env.DEBUG_GLYPHS.split(',')) {
            await openGlyph(ORDER.find(o => o.name === name)); await p.waitForTimeout(1500); await closeTips();
            await drawGlyph(name); await p.screenshot({ path: path.join(OUT, `dbg-${name}.png`) });
            await back();
        }
        await browser.close(); return;
    }

    // 2. Draw every glyph. The editor's Next arrow steps through the set; accented letters are
    //    skipped here (the app builds them by placing a mark on a letter; see step 3).
    await caption('Draw every glyph; the editor\'s Next arrow steps through the whole set');
    const toDraw = ORDER.filter(it => !it.positioned && G[it.name]);
    const drawn = []; const missing = [];
    await openGlyph(toDraw[0]);
    for (const item of toDraw) {
        if ((await title()) !== item.name) {
            // Not reached by Next (an accented letter sits in between): reopen from the grid.
            await back(); await openGlyph(item);
            if ((await title()) !== item.name) { missing.push(item.name); continue; }
        }
        await caption(`Draw “${item.name}”  (${drawn.length + 1} of ${toDraw.length})`);
        await drawGlyph(item.name); drawn.push(item.name); await p.waitForTimeout(120); await closeTips();
        if (['A', 'g', '&', '5'].includes(item.name)) await shot(`02-draw-${encodeURIComponent(item.name)}`);
        const next = navRow().locator(':scope > button').last();
        if (await next.isEnabled().catch(() => false)) { await next.click(); await p.waitForTimeout(600); await closeTips(); }
    }
    log(`drew ${drawn.length} of ${toDraw.length}${missing.length ? '; could not open: ' + missing.join(' ') : ''}`);
    await back(); await p.waitForTimeout(1500); await shot('03-grid-drawn');

    // 3. Positioning: every accented letter, with one adjusted by hand
    const toPosition = ORDER.filter(it => it.positioned);
    const positioned = [];
    for (const item of toPosition) {
        await openGlyph(item);
        const acceptPos = p.locator('[data-tour="header-accept-pos"]').first();
        const clickSafely = async (loc) => { await closeTips(); await loc.click({ timeout: 3000 }).catch(() => loc.click({ force: true }).catch(() => {})); };
        if (positioned.length === 0) {
            await caption(`Position “${item.name}”: nudge the accent up by hand, then save`);
            const box = await canvasBox(); const sc = box.width / 1000;
            await p.mouse.move(box.x + 500 * sc, box.y + 395 * sc); await p.mouse.down();
            await p.mouse.move(box.x + 500 * sc, box.y + 365 * sc, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(700);
            await shot('04-position-by-hand');
            const save = p.locator('button[title="Save"]').first();
            if (await save.count() && await save.isEnabled().catch(() => false)) await clickSafely(save);
            else if (await acceptPos.count()) await clickSafely(acceptPos);
        } else {
            await caption(`Position “${item.name}”: accept the suggested placement`);
            if (await acceptPos.count() && await acceptPos.isEnabled().catch(() => false)) await clickSafely(acceptPos);
        }
        positioned.push(item.name); await p.waitForTimeout(600);
        await back();
    }
    if (toPosition.length) { log(`positioned ${positioned.length}: ${positioned.join(' ')}`); await shot('05-positioned'); }
    const skipped = ORDER.filter(it => !it.positioned && !G[it.name]).map(it => it.name);

    // 4. Spacing: auto-kern all pairs, accept, then fine-tune one pair by hand
    await caption('Spacing: auto-kern every pair of letters');
    await p.getByRole('button', { name: /Spacing|Kerning/ }).first().click(); await p.waitForTimeout(1800); await closeTips();
    await p.getByRole('button', { name: 'All Pairs' }).first().click(); await p.waitForTimeout(800); await closeTips();
    for (const sa of await p.getByRole('button', { name: 'Select All' }).all()) await sa.click().catch(() => {});
    await p.waitForTimeout(800); await shot('06-all-pairs');
    await p.getByRole('button', { name: /Auto-kern/ }).first().click();
    for (let t = 0; t < 240; t++) { await p.waitForTimeout(1000); if (!(await p.getByText(/Auto-?kerning|Calculating/i).count())) break; }
    await p.waitForTimeout(1500); await closeTips(); await shot('07-autokerned');
    await caption('Accept the suggested spacing');
    const suggestionsTab = p.getByRole('button', { name: 'Suggestions', exact: true }).first();
    if (await suggestionsTab.count()) { await suggestionsTab.click(); await p.waitForTimeout(1000); await closeTips(); }
    const acceptSugg = p.getByRole('button', { name: /Accept Suggestions|Accept All|Accept Visible/ }).first();
    if (await acceptSugg.count()) { await acceptSugg.click(); await p.waitForTimeout(1500); }
    await shot('08-spacing-accepted');

    // 5. Try it: Test page
    await caption('Try the font on the Test page');
    await p.getByRole('button', { name: /^Test$/ }).first().click(); await p.waitForTimeout(6000);
    const ea = p.getByRole('button', { name: 'Export Anyway' }); if (await ea.count()) { await ea.click(); await p.waitForTimeout(5000); }
    const area = p.locator('textarea').first();
    if (await area.count()) { await area.fill(SAMPLE); await p.waitForTimeout(2500); }
    await shot('09-test-page');
    await back();

    // 6. Creator
    await caption('Make something with it in Creator');
    const create = p.getByRole('button', { name: /^Create$/ }).first();
    if (await create.count()) {
        await create.click(); await p.waitForTimeout(6000); await closeTips();
        const text = p.locator('textarea, [contenteditable="true"], input[type="text"]').first();
        if (await text.count()) { await text.fill(SCRIPT === 'english' ? 'Hello World' : '¡Hola, Mañana!').catch(() => {}); await p.waitForTimeout(2500); }
        await shot('10-creator');
        const studio = p.locator('div.fixed.inset-0.z-50 header');
        const imgP = p.waitForEvent('download', { timeout: 30000 }).catch(() => null);
        await studio.locator('button').nth(1).click().catch(() => {});
        const img = await imgP;
        if (img) { await img.saveAs(path.join(OUT, `${SCRIPT}-studio.png`)); log('saved Studio image'); }
        await p.waitForTimeout(1000);
        await studio.locator('button').first().click(); await p.waitForTimeout(1500); await closeTips();
    }

    // 7. Export
    await caption('Export the font');
    const dlP = p.waitForEvent('download', { timeout: 240000 }).catch(() => null);
    await closeTips(); await p.locator('[data-tour="header-export"]').first().click(); await p.waitForTimeout(800);
    if (await ea.count()) await ea.click();
    const dl = await dlP;
    const fontFile = path.join(OUT, `${SCRIPT}.otf`);
    if (dl) { await dl.saveAs(fontFile); log('exported', fontFile); } else log('NO DOWNLOAD');
    await p.waitForTimeout(1500); await shot('11-exported');

    // 8. Show the exported font itself
    if (dl) {
        const b64 = fs.readFileSync(fontFile).toString('base64');
        const letters = ORDER.map(o => o.name).filter(n => n.length === 1 && /\p{L}/u.test(n)).join(' ');
        await p.setContent(`<!doctype html><meta charset="utf-8"><style>
            @font-face { font-family: Made; src: url(data:font/otf;base64,${b64}); }
            body { margin: 40px; font-family: system-ui; color: #111; }
            h1 { font: 600 18px system-ui; color: #555; margin: 0 0 18px; }
            .big { font-family: Made; font-size: 64px; line-height: 1.15; white-space: pre-wrap; }
            .med { font-family: Made; font-size: 34px; line-height: 1.3; margin-top: 24px; white-space: pre-wrap; }
            .label { font: 13px system-ui; color: #777; margin-top: 18px; }
        </style>
        <h1>The exported ${SCRIPT === 'english' ? 'English' : 'Spanish'} font (${path.basename(fontFile)}), rendered by the browser</h1>
        <div class="big">${SAMPLE.split('\n')[0]}</div>
        <div class="med">${SAMPLE.split('\n').slice(1).join('\n')}</div>
        <div class="label">Every letter in the font (accented ones were positioned in the app):</div>
        <div class="med">${letters}</div>`);
        await p.waitForTimeout(1500);
        await caption('The exported font, rendered by the browser');
        await p.waitForTimeout(4000); await shot('12-exported-font');
    }

    log('page errors:', errors.length ? errors : 'none');
    await ctx.close();
    if (process.env.VIDEO) {
        const vids = fs.readdirSync(OUT).filter(f => f.endsWith('.webm') && !f.startsWith(SCRIPT));
        for (const v of vids) fs.renameSync(path.join(OUT, v), path.join(OUT, `${SCRIPT}.webm`));
    }
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ drawn, positioned, skipped, fontReadyShown: celebrated, errors, exported: !!dl }, null, 2));
})().catch(async e => { console.log(`[${SCRIPT}] FAILED:`, e.message.split('\n')[0]); await global.__page?.screenshot({ path: path.join(OUT, 'FAILED.png') }).catch(() => {}); console.log(e.message.split("\n").slice(0,6).join(" / ")); process.exit(1); });
