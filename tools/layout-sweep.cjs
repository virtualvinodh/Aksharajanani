// Responsive layout sweep: screenshots + geometric checks at multiple viewports.
// Seeds a Tamil project (grid, editor, spacing, Test) and a Devanagari one (positioning), and reports
// per viewport: header/canvas sizes, page scroll, toolbar clipping/overlap, and buttons that can't be
// clicked (covered or clipped).
//   node tools/layout-sweep.cjs            VPS=1280x800,390x844 to pick viewports, SKIP_TAMIL=1
// Output: tools/out/layout/ (screenshots and report.txt).
const { chromium, launchOptions, BASE, dismissTips, drag } = require('./lib/browser.cjs');
const fs = require('fs');
const OUT = __dirname + '/out/layout';
const PROFILE = __dirname + '/out/layout-profile';
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = (process.env.VPS || '1024x768,1280x720,1280x800,1366x768,1440x900,1470x956,1536x864,1920x1080,2560x1440,768x1024,390x844')
  .split(',').map(s => { const [w, h] = s.split('x').map(Number); return { w, h, name: s }; });
const report = [];
const log = (s) => { console.log(s); report.push(s); };

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) }; };
    const label = (b) => (b.getAttribute('aria-label') || b.title || b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30) || '<icon>';
    // Buttons whose centre is not hit-testable => clipped by an overflow ancestor, off-screen, or covered by another element.
    const blocked = [];
    for (const b of document.querySelectorAll('button')) {
      if (!vis(b) || b.disabled) continue;
      const r = b.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      let scroller = null;
      for (let p = b.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) { scroller = p; break; } }
      if (scroller) { const sr = scroller.getBoundingClientRect(); if (cx < sr.left || cx > sr.right || cy < sr.top || cy > sr.bottom) continue; /* reachable by scrolling */ }
      if (window.__scope && !b.closest(window.__scope)) continue;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { blocked.push(label(b) + ' [offscreen]'); continue; }
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(b === hit || b.contains(hit) || hit.contains(b))) {
        let who = hit ? (hit.closest('[data-tour]')?.getAttribute('data-tour') || hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ').slice(0, 3).join('.') : '')) : 'nothing';
        blocked.push(label(b) + ' [under ' + who.slice(0, 60) + ']');
      }
    }
    const canvases = [...document.querySelectorAll('canvas')].filter(vis).map(c => c.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height);
    const tb = document.querySelector('[data-tour="main-toolbar"]');
    let toolbar = null;
    if (tb && vis(tb)) {
      // How much of the toolbar is actually visible (clip by every overflow ancestor and the viewport)
      let top = 0, bottom = innerHeight, left = 0, right = innerWidth;
      for (let p = tb.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(hidden|auto|scroll|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX)) { const r = p.getBoundingClientRect(); top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); left = Math.max(left, r.left); right = Math.min(right, r.right); }
      }
      const r = tb.getBoundingClientRect();
      const visH = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));
      const visW = Math.max(0, Math.min(r.right, right) - Math.max(r.left, left));
      toolbar = { ...R(tb), visiblePct: Math.round(100 * (visH * visW) / (r.width * r.height)), innerScroll: tb.scrollHeight > tb.clientHeight + 2 };
    }
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const strips = [...document.querySelectorAll('[data-tour="linked-source-strip"], [data-tour="linked-source-strip"] ~ div')].filter(vis).map(R);
    return {
      vw: innerWidth, vh: innerHeight,
      hOverflow: document.documentElement.scrollWidth - innerWidth,
      vOverflow: document.documentElement.scrollHeight - innerHeight,
      header: R(header), footer: footer && vis(footer) ? R(footer) : null,
      canvas: canvases[0] ? { w: Math.round(canvases[0].width), h: Math.round(canvases[0].height), x: Math.round(canvases[0].x), y: Math.round(canvases[0].y) } : null,
      toolbar, strips, blocked: [...new Set(blocked)],
    };
  });
  const parts = [];
  if (m.header) parts.push(`header ${m.header.h}px (${Math.round(100 * m.header.h / m.vh)}%)`);
  if (m.footer) parts.push(`footer ${m.footer.h}px`);
  if (m.canvas) parts.push(`canvas ${m.canvas.w}x${m.canvas.h} (${Math.round(100 * m.canvas.h / m.vh)}% of vh)`);
  if (m.toolbar) parts.push(`toolbar ${m.toolbar.w}x${m.toolbar.h}@${m.toolbar.x},${m.toolbar.y} visible ${m.toolbar.visiblePct}%`);
  if (m.toolbar && m.canvas && m.toolbar.r > m.canvas.x && m.toolbar.x < m.canvas.x + m.canvas.w && m.toolbar.b > m.canvas.y && m.toolbar.y < m.canvas.y + m.canvas.h) parts.push('TOOLBAR OVERLAPS CANVAS');
  if (m.toolbar && m.toolbar.x < 0) parts.push('TOOLBAR OFF LEFT EDGE');
  if (m.toolbar) for (const s of m.strips) if (m.toolbar.b > s.y && m.toolbar.y < s.b && m.toolbar.r > s.x && m.toolbar.x < s.r) parts.push('TOOLBAR OVERLAPS LINKED STRIP');
  if (m.hOverflow > 1) parts.push(`H-SCROLL +${m.hOverflow}px`);
  if (m.vOverflow > 1) parts.push(`page v-scroll +${m.vOverflow}px`);
  if (m.blocked.length) parts.push(`unclickable buttons (${m.blocked.length}): ${m.blocked.slice(0, 12).join('; ')}`);
  log(`  ${label}: ${parts.join(' | ')}`);
  return m;
}

const shot = (page, vp, name) => page.screenshot({ path: `${OUT}/${vp.name}-${name}.png` });
const openTab = async (page, re) => { const t = page.getByRole('button', { name: re }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(1500); await dismissTips(page); return true; } return false; };
const back = async (page) => { const b = page.getByRole('button', { name: 'Back' }).first(); if (await b.count() && await b.isVisible()) { await b.click(); await page.waitForTimeout(1500); } };

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, launchOptions({ viewport: { width: 1440, height: 900 } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('tutorial_dismissed', 'true'); localStorage.setItem('donateNoticeDismissed', 'true'); } catch { /* storage blocked */ } });
  const page = ctx.pages()[0];
  page.on('pageerror', e => log('PAGEERROR ' + (e.stack || e.message).slice(0, 900)));

  // ---- seed a Tamil project with a few glyphs so Spacing/Positioning become available
  await page.goto(BASE); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Tamil/ }).first().click(); await page.waitForTimeout(3000); await dismissTips(page);
  for (const [g, pts] of [['அ', [[0.3, 0.3], [0.5, 0.7], [0.7, 0.3]]], ['க', [[0.3, 0.3], [0.3, 0.7], [0.7, 0.5]]], ['ங', [[0.3, 0.5], [0.7, 0.5], [0.5, 0.7]]], ['்', [[0.48, 0.2], [0.52, 0.22]]], ['ா', [[0.4, 0.3], [0.4, 0.7]]]]) {
    let el = page.getByText(g, { exact: true }).first();
    if (!(await el.count())) { await page.getByRole('button', { name: 'Combining Signs' }).first().click().catch(() => {}); await page.waitForTimeout(1000); el = page.getByText(g, { exact: true }).first(); }
    if (!(await el.count())) { log('seed: glyph not found ' + g); continue; }
    await el.click(); await page.waitForTimeout(1200); await dismissTips(page);
    await drag(page, 'canvas', pts); await page.waitForTimeout(500);
    await back(page); await page.waitForTimeout(1500);
  }
  log('seed tabs: ' + JSON.stringify(await page.$$eval('nav button', bs => bs.map(b => b.innerText.trim()))));

  for (const vp of (process.env.SKIP_TAMIL ? [] : VIEWPORTS)) { try {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(800);
    log(`\n=== ${vp.name} ===`);
    // grid
    await openTab(page, /Character Grid/);
    await back(page);
    await shot(page, vp, '1-grid'); await measure(page, 'grid');
    // editor
    await page.getByRole('button', { name: 'Vowels' }).first().click().catch(() => {}); await page.waitForTimeout(600); await page.locator('[data-status="complete"], [data-status="review-required"]').first().click(); await page.waitForTimeout(1500); await dismissTips(page);
    await shot(page, vp, '2-editor'); await measure(page, 'editor');
    // maximised editor
    const max = page.getByRole('button', { name: 'Maximize editor' }).first();
    if (await max.count() && await max.isVisible()) { await max.click(); await page.waitForTimeout(900); await dismissTips(page); await shot(page, vp, '2b-editor-max'); await measure(page, 'editor maximised'); await page.getByRole('button', { name: 'Show Split View' }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600); }
    // selection -> contextual toolbar
    await page.getByRole('button', { name: 'Select', exact: true }).last().click().catch(() => {});
    { const boxes = await page.$$eval('canvas', cs => cs.map(c => c.getBoundingClientRect().toJSON())); const bx = boxes.sort((a, b) => b.width * b.height - a.width * a.height)[0]; await page.mouse.click(bx.x + 0.3 * bx.width, bx.y + 0.5 * bx.height); await page.waitForTimeout(700); }
    await shot(page, vp, '3-editor-selected'); await measure(page, 'editor w/ selection');
    await page.keyboard.press('Escape');
    // properties panel
    const props = page.getByRole('button', { name: 'Glyph Properties' }).first();
    if (await props.count() && await props.isVisible()) { await props.click(); await page.waitForTimeout(800); await shot(page, vp, '4-editor-properties'); await measure(page, 'editor + properties'); await props.click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(400); }
    await back(page);
    // spacing / kerning
    if (await openTab(page, /Spacing|Kerning/)) {
      await shot(page, vp, '7-spacing'); await measure(page, 'spacing list');
      await page.getByRole('button', { name: 'All Pairs' }).first().click().catch(() => {}); await page.waitForTimeout(1200);
      const card = page.locator('main canvas').first();
      if (await card.count()) { await card.click().catch(() => {}); await page.waitForTimeout(1500); await dismissTips(page); await shot(page, vp, '8-spacing-editor'); await measure(page, 'spacing editor'); await back(page); }
    }
    await openTab(page, /Character Grid/);
    // Test page
    await page.keyboard.press('Escape'); await page.locator('div.fixed.inset-0.bg-black\\/50').first().click({ timeout: 1000 }).catch(() => {});
    if (await openTab(page, /^Test$/)) { await shot(page, vp, '9-test'); await page.evaluate(() => { window.__scope = '.fixed, [role=dialog]'; }); await measure(page, 'test page'); await page.evaluate(() => { window.__scope = null; }); await back(page); await page.keyboard.press('Escape'); }
  } catch (e) { log('  ERROR ' + e.message.split('\n')[0]); await page.keyboard.press('Escape'); } }
  // ---- Positioning pass (Devanagari)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Aksharajanani/ }).first().click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Devanagari/ }).first().click(); await page.waitForTimeout(4000); await dismissTips(page);
  for (const [g, pts] of [['अ', [[0.3, 0.4], [0.5, 0.7], [0.7, 0.4]]], ['ं', [[0.48, 0.15], [0.52, 0.17]]]]) {
    const el = page.getByText(g, { exact: true }).first();
    if (!(await el.count())) { log('deva seed: not found ' + g); continue; }
    await el.click(); await page.waitForTimeout(1200); await dismissTips(page);
    await drag(page, 'canvas', pts); await page.waitForTimeout(500); await back(page); await page.waitForTimeout(1500);
  }
  log('deva tabs: ' + JSON.stringify(await page.$$eval('nav button', bs => bs.map(b => b.innerText.trim().replace(/\s+/g, ' ')))));
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h }); await page.waitForTimeout(800);
    log(`\n=== ${vp.name} (Devanagari positioning) ===`);
    if (await openTab(page, /Positioning/)) {
      await shot(page, vp, '5-positioning'); await measure(page, 'positioning grid');
      const card = page.getByRole('button', { name: /Check Positioning/ }).first();
      if (await card.count()) { await card.click().catch(() => {}); await page.waitForTimeout(1500); await dismissTips(page); await shot(page, vp, '6-positioning-editor'); await measure(page, 'positioning editor'); await back(page); }
    }
  }
  fs.writeFileSync(OUT + '/report.txt', report.join('\n') + '\n');
  await ctx.close();
})();
