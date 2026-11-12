"""Check an exported font against the project it came from: every rule the project defines should
work in the font, as HarfBuzz (the shaper used by Chrome, Android, LibreOffice…) applies it.

    uv run --with fonttools --with uharfbuzz --with freetype-py --with pillow \\
        python3 tools/font/rulecheck.py font.otf project.json [guide-font.otf] [--sample "text"]

The project file is the one "More → Export JSON" downloads (tools/e2e/e2e.cjs saves it next to
the font). Checks:

1. Letters:      every letter in the project is in the font and has a shape.
2. Joining:      every letter made by a joining rule (`liga`, e.g. క + ్ + ష → క్ష) comes out when
                 its sequence is typed. Signs that need a letter before them (్ర…) are tried after
                 a consonant too.
3. Marks:        for every positioning rule (letters × marks, e.g. all consonants × ottus), the mark
                 is moved onto the letter (the font's mark positioning changes its place).
4. Spacing:      every spaced pair in the project is spaced in the font; how many of the script's
                 suggested pairs got spaced.

Writes a report next to the font (<font>-rulecheck.md) and, with a guide font, a picture of the
sample text in both fonts (<font>-compare.png) for a reader of the script to judge.
"""
import json, os, re, sys
from collections import defaultdict
import uharfbuzz as hb

args = [a for a in sys.argv[1:]]
sample = None
if '--sample' in args:
    i = args.index('--sample'); sample = args[i + 1]; del args[i:i + 2]
font_path, project_path = args[0], args[1]
guide_path = args[2] if len(args) > 2 else None
project = json.load(open(project_path, encoding='utf-8'))

blob = hb.Blob.from_file_path(font_path); face = hb.Face(blob); font = hb.Font(face)
UPEM = face.upem
# Glyph names in the exported font are uniXXXX of each letter's code point.
from fontTools.ttLib import TTFont
tt = TTFont(font_path)
order = tt.getGlyphOrder()
cmap = tt.getBestCmap()
glyphset = tt.getGlyphSet()

# ---- the project's letters, groups and rules -------------------------------------------------
sets = project.get('characterSets') or []
chars = [c for st in sets for c in (st.get('characters') or [])]
by_name = {c['name']: c for c in chars}
set_members = {st.get('nameKey'): [c['name'] for c in st.get('characters') or []] for st in sets}
rules = project.get('fontRules') or {}
groups = {}
for src in (rules.get('groups') if isinstance(rules, dict) else None, project.get('groups'), project.get('positioningGroups')):
    if isinstance(src, dict): groups.update(src)

def expand(items, depth=0):
    out = []
    for n in ([items] if isinstance(items, str) else items or []):
        if depth < 8 and isinstance(n, str) and n[:1] in '$@':
            key = n[1:]
            out += expand(groups[key], depth + 1) if key in groups else set_members.get(key, [])
        else:
            out.append(n)
    return list(dict.fromkeys(out))

def code_point(c):
    if c is None: return None
    if c.get('unicode') is not None: return int(c['unicode'])
    n = c['name']
    return ord(n) if len([*n]) == 1 else None

def glyph_for(name):
    cp = code_point(by_name.get(name))
    return cmap.get(cp) if cp is not None else None

def text_for(name):
    """What a person types to get this letter."""
    c = by_name.get(name)
    if c and c.get('liga'): return ''.join(c['liga'])
    if c and c.get('unicode') is not None and not (0xE000 <= int(c['unicode']) <= 0xF8FF): return chr(int(c['unicode']))
    return name

def shape(text, features=None):
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, features or {})
    return [(order[i.codepoint], p) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]

def has_outline(g):
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(glyphset); glyphset[g].draw(bp); return bp.bounds is not None

report = []
def section(title): report.append(f'\n## {title}\n')
def line(s=''): report.append(s)

# ---- 1. letters ------------------------------------------------------------------------------
section('1. Letters')
missing, empty, unknown = [], [], []
for c in chars:
    if c.get('hidden') or c['name'] in ('zwj', 'zwnj'): continue
    cp = code_point(c)
    if cp is None: unknown.append(c['name']); continue
    g = cmap.get(cp)
    if g is None: missing.append(c['name'])
    elif (c.get('glyphClass') != 'mark') and cp not in (0x20, 0xA0, 0x200C, 0x200D) and not has_outline(g): empty.append(c['name'])
line(f'{len(chars)} letters in the project; **{len(missing)} missing** from the font, **{len(empty)} without a shape**' + (f', {len(unknown)} without a code point in the project file' if unknown else '') + '.')
if missing: line('- Missing: ' + ' '.join(missing[:80]))
if empty: line('- No shape: ' + ' '.join(empty[:80]))

# ---- 2. joining rules ------------------------------------------------------------------------
section('2. Joining rules (`liga`)')
consonants = [n for n in set_members.get('consonants', []) if glyph_for(n)] or \
             [c['name'] for c in chars if c.get('glyphClass', 'base') == 'base' and len(c['name']) == 1 and ord(c['name']) > 0x7f and glyph_for(c['name'])]
carrier = text_for(consonants[0]) if consonants else ''
import unicodedata
by_feature = defaultdict(lambda: [0, 0]); failures = []; internal = []
for c in chars:
    if not c.get('liga') or c.get('hidden'): continue
    want = glyph_for(c['name'])
    if want is None: continue
    seq = ''.join(c['liga'])
    out = [g for g, _ in shape(seq)]
    ok = want in out
    if not ok and carrier:  # signs like ్ర need a letter in front to form
        ok = want in [g for g, _ in shape(carrier + seq)]
    feat = c.get('gsub') or 'liga'
    if not ok and c['liga'][0] and unicodedata.category(c['liga'][0][0]).startswith('M') and c['liga'][0][0] not in '\u0C4D\u0D4D\u0BCD\u094D\u0CCD':
        internal.append(c['name']); continue  # e.g. ౖ ్ ఖ: an order the shaper makes after reordering; only real words reach it
    by_feature[feat][0 if ok else 1] += 1
    if not ok: failures.append((c['name'], feat, seq, out, c.get('if')))
total_ok = sum(v[0] for v in by_feature.values()); total_bad = sum(v[1] for v in by_feature.values())
line(f'{total_ok + total_bad} joined letters: **{total_ok} form correctly, {total_bad} don\'t**.' + (f' ({len(internal)} more are written in the order the shaper produces after reordering, e.g. `{" + ".join(by_name[internal[0]]["liga"])}`; only real words reach them, so check those in the sample picture.)' if internal else ''))
line(); line('| Joining step | Form | Don\'t |'); line('|---|---|---|')
for f, (a, b) in sorted(by_feature.items()): line(f'| `{f}` | {a} | {b} |')
if failures:
    line(); line('Letters that don\'t form (typed sequence → what the font gives):'); line()
    for name, feat, seq, out, cond in failures[:25]:
        line(f'- `{name}` ({feat}{", only when: " + str(cond) if cond else ""}): `{" + ".join(seq)}` → {" ".join(out)}')
    if len(failures) > 25: line(f'- … and {len(failures) - 25} more')

# ---- 3. mark positioning ---------------------------------------------------------------------
section('3. Mark positioning')
mark_feats = {'mark': False, 'mkmk': False, 'abvm': False, 'blwm': False, 'dist': False}
pos_rules = project.get('positioningRules') or []
checked = attached = 0; not_attached = defaultdict(list); internal_marks = defaultdict(int)
for r in pos_rules:
    bases = [b for b in expand(r.get('base')) if glyph_for(b)]
    marks = [m for m in expand(r.get('mark')) if glyph_for(m)]
    import unicodedata
    def moved(t):
        on, off = shape(t), shape(t, mark_feats)
        if len(on) != len(off): return True  # the pair was replaced by a ligature
        # Marks move by offset; spacing signs (Telugu ు) by their advance ('dist').
        return any((a[1].x_offset, a[1].y_offset, a[1].x_advance) != (b2[1].x_offset, b2[1].y_offset, b2[1].x_advance) for a, b2 in zip(on, off))
    for b in bases:
        bt = text_for(b)
        if bt and unicodedata.category(bt[0]).startswith('M'): bt = carrier + bt  # a sign form (്ര) needs its consonant
        for m in marks:
            checked += 1
            # Most marks follow their letter; some are typed before it (Malayalam dot reph ൎ).
            mt = text_for(m)
            # Typing orders: letter + mark; mark first (Malayalam ൎ); and a below-base form typed
            # inside a vowel-sign letter, after its consonant (కా + ్ఖ is typed క ్ఖ ా).
            tries = [bt + mt, mt + bt] + ([bt[:1] + mt + bt[1:]] if len(bt) > 1 else [])
            if any(moved(t) for t in tries): attached += 1
            elif mt and unicodedata.category(mt[0]).startswith('M') and mt[0] not in '\u0C4D\u0D4D\u0BCD\u094D\u0CCD':
                internal_marks[m] += 1; attached_internal = True  # e.g. ౖ forms: only reached from real words (క్ఖై)
            else: not_attached[m].append(b)
n_internal = sum(internal_marks.values())
line(f'{len(pos_rules)} positioning rules cover {checked} letter + mark pairs: **{attached} placed, {checked - attached - n_internal} not moved by the font**'
     + (f', {n_internal} with signs only real words reach (e.g. `{next(iter(internal_marks))}`), see the sample picture' if n_internal else '') + '.')
for m, bs in sorted(not_attached.items(), key=lambda kv: -len(kv[1]))[:25]:
    line(f'- Mark `{m}` not placed on {len(bs)} letters, e.g. ' + ' '.join(bs[:12]))

# ---- 3b. classes: synced pairs follow their representative ----------------------------------
classes = project.get('markAttachmentClasses') or []
saved = {}
for key, val in project.get('markPositioning') or []:
    try: b_cp, m_cp = (int(x) for x in str(key).split('-')[:2])
    except ValueError: continue
    x, y = (val.get('x'), val.get('y')) if isinstance(val, dict) else (tuple(val) + (None, None))[:2]
    saved[(b_cp, m_cp)] = (round(x), round(y)) if isinstance(x, (int, float)) and isinstance(y, (int, float)) else 'not a number'
bad_saved = [(b, m) for (b, m), v in saved.items() if v == 'not a number']
if bad_saved:
    line(); line(f'**{len(bad_saved)} saved placements aren\'t numbers** (they break the font\'s rules at export): ' + ', '.join(chr(b) + ' + ' + chr(m) for b, m in bad_saved[:12]))
# A synced pair's placement is its own default + the representative's hand adjustment
# (services/positioningService.ts). So after moving a representative by hand (tools/e2e saves which
# in summary.json, "handMoved"), every pair synced with it should be off its default by the same amount.
summary_path = os.path.join(os.path.dirname(project_path), 'summary.json')
moved = json.load(open(summary_path)).get('handMoved') if os.path.exists(summary_path) else None
stroke = ((project.get('settings') or {}).get('strokeThickness') or 15) / 2
glyph_paths = {int(k): v for k, v in (project.get('glyphs') or []) if str(k).lstrip('-').isdigit()}
def bbox(cp):
    pts = [pt for path in (glyph_paths.get(cp) or {}).get('paths', []) for pt in (path.get('points') or [])
           if isinstance(pt.get('x'), (int, float)) and isinstance(pt.get('y'), (int, float))]
    if not pts: return None
    xs, ys = [pt['x'] for pt in pts], [pt['y'] for pt in pts]
    return (min(xs) - stroke, min(ys) - stroke, max(xs) + stroke, max(ys) + stroke)
def point(bb, name):
    x0, y0, x1, y1 = bb; n = (name or '').lower()
    x = x0 if 'left' in n else x1 if 'right' in n else (x0 + x1) / 2
    y = y0 if n.startswith('top') else y1 if n.startswith('bottom') else (y0 + y1) / 2
    return x, y
mar = project.get('markAttachmentRules') or {}
def default_offset(base, mark):
    for key, marks in mar.items():
        if mark in marks and base in expand([key]):
            r = marks[mark]; bb, mb = bbox(code_point(by_name.get(base))), bbox(code_point(by_name.get(mark)))
            if not bb or not mb: return None
            bx, by = point(bb, r[0]); mx, my = point(mb, r[1])
            dx = float(r[2]) if len(r) > 2 else 0; dy = float(r[3]) if len(r) > 3 else 0
            return (bx + dx - mx, by + dy - my)
    # No rule: the app puts the mark beside the letter (calculateDefaultMarkOffset's fallback).
    bb, mb = bbox(code_point(by_name.get(base))), bbox(code_point(by_name.get(mark)))
    if not bb or not mb: return None
    met = project.get('metrics') or {}
    rsb = by_name[base].get('rsb', met.get('defaultRSB', 0)); lsb = by_name[mark].get('lsb', met.get('defaultLSB', 0))
    return (bb[2] + float(rsb) + float(lsb) - mb[0], 0)
if classes and moved:
    line(); line('**Mark classes:** pairs synced with a hand-moved representative should move with it.')
    for mv in moved:
        pair = mv['pair']; base = next((b for b in by_name if pair.startswith(b) and pair[len(b):] in by_name), None)
        mark = pair[len(base):] if base else None
        cls = next((expand(c.get('members')) for c in classes if mark in expand(c.get('members'))), [mark])
        rows = []
        # Prefer the app's own defaults (tools/font/app-defaults.ts via tsx); approximate otherwise.
        exact = {}
        try:
            import subprocess
            repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
            res = subprocess.run(['npx', 'tsx', os.path.join(repo, 'tools', 'font', 'app-defaults.ts'), os.path.abspath(project_path)] + [f'{base}:{m}' for m in cls],
                                 cwd=repo, capture_output=True, text=True, timeout=300)
            exact = {k.split(':', 1)[1]: (v['x'], v['y']) for k, v in json.loads(res.stdout.strip().splitlines()[-1]).items() if v}
        except Exception as e:
            line(f'  (app defaults unavailable, using an approximation: {e})')
        for m in cls:
            key = (code_point(by_name.get(base)), code_point(by_name.get(m)))
            got, d = saved.get(key), exact.get(m) or default_offset(base, m)
            if isinstance(got, tuple) and d:
                rows.append((m, round(got[0] - d[0]), round(got[1] - d[1])))
        want = mv.get('dy', 0)
        ok = rows and all(abs(dy - want) <= 1 for _, _, dy in rows)
        line(f'- Moved `{pair}` by {want} (up is negative). Off their defaults by: ' + ', '.join(f'`{base}{m}` {dy:+d}' for m, _, dy in rows)
             + (' — **all follow**.' if ok else ' — **not all follow**.'))
elif classes:
    line(); line(f'**Mark classes:** {len(classes)}. (Run through tools/e2e to test that synced pairs follow a hand-moved one.)')

# ---- 4. spacing ------------------------------------------------------------------------------
section('4. Spacing')
kern = dict((k, v) for k, v in (project.get('kerning') or []))
uni_to_name = {code_point(c): c['name'] for c in chars if code_point(c) is not None}
import unicodedata as _ud
kern_ok = kern_bad = kern_skip = 0; bad = []
for key, val in kern.items():
    if not val: continue
    l, r = (int(x) for x in key.split('-'))
    ln, rn = uni_to_name.get(l), uni_to_name.get(r)
    if not ln or not rn or not glyph_for(ln) or not glyph_for(rn): continue
    lt = text_for(ln)
    if lt and _ud.category(lt[0]).startswith('M'):
        kern_skip += 1; continue  # a sign form (്ര) on the left: shaping moves it, so the pair is never side by side here
    lg, rg = glyph_for(ln), glyph_for(rn)
    out = shape(text_for(ln) + text_for(rn))
    names = [g for g, _ in out]
    at = next((i for i in range(len(names) - 1) if names[i] == lg and names[i + 1] == rg), None)
    if at is None:
        kern_skip += 1; continue  # typed one after the other they don't stay side by side (క్ + క makes a conjunct)
    plain = shape(text_for(ln) + text_for(rn), {'kern': False, 'dist': False})
    if out[at][1].x_advance != plain[at][1].x_advance: kern_ok += 1
    else: kern_bad += 1; bad.append(ln + rn)
line(f'{kern_ok + kern_bad + kern_skip} spaced pairs in the project: **{kern_ok} spaced in the font, {kern_bad} not**' + (f', {kern_skip} that typing doesn\'t put side by side (sign forms, half forms) not checked' if kern_skip else '') + '.' + (' Not spaced, e.g. ' + ' '.join(bad[:20]) if bad else ''))
rec = project.get('recommendedKerning') or []
if rec:
    pairs = {(a, b) for r in rec for a in expand(r[0]) for b in expand(r[1])}
    name_to_uni = {c['name']: code_point(c) for c in chars}
    done = sum(1 for a, b in pairs if f'{name_to_uni.get(a)}-{name_to_uni.get(b)}' in kern)
    line(f'Suggested pairs: {len(pairs)}; **{done} spaced** ({round(100 * done / max(1, len(pairs)))}%).')

# ---- sample picture --------------------------------------------------------------------------
def render(path, text, size=56):
    import freetype, numpy as np
    from PIL import Image
    f = hb.Font(hb.Face(hb.Blob.from_file_path(path))); ft = freetype.Face(path)
    upem = hb.Face(hb.Blob.from_file_path(path)).upem
    ft.set_char_size(size * 64)
    lines = text.split('\n'); lh = int(size * 1.9); W = 2000
    img = np.full((lh * len(lines) + 20, W), 255, dtype=np.uint8)
    for li, t in enumerate(lines):
        buf = hb.Buffer(); buf.add_str(t); buf.guess_segment_properties(); hb.shape(f, buf, {})
        x = 10.0; base = lh * li + int(size * 1.3)
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            ft.load_glyph(info.codepoint, freetype.FT_LOAD_DEFAULT); ft.glyph.render(freetype.FT_RENDER_MODE_NORMAL)
            bm = ft.glyph.bitmap
            if bm.width and bm.rows:
                a = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)[:, :bm.width]
                x0 = int(x + pos.x_offset * size / upem) + ft.glyph.bitmap_left; y0 = base - int(pos.y_offset * size / upem) - ft.glyph.bitmap_top
                ys, xs = slice(max(0, y0), min(img.shape[0], y0 + bm.rows)), slice(max(0, x0), min(W, x0 + bm.width))
                if ys.stop > ys.start and xs.stop > xs.start:
                    img[ys, xs] = np.minimum(img[ys, xs], 255 - a[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0])
            x += pos.x_advance * size / upem
    return Image.fromarray(img)

stem = os.path.splitext(font_path)[0]
if sample and guide_path:
    from PIL import Image, ImageDraw
    a, b = render(font_path, sample), render(guide_path, sample)
    out = Image.new('L', (max(a.width, b.width), a.height + b.height + 60), 255); d = ImageDraw.Draw(out)
    d.text((10, 5), 'Exported font', fill=120); out.paste(a, (0, 22))
    d.text((10, a.height + 32), 'Guide font', fill=120); out.paste(b, (0, a.height + 50))
    out.save(stem + '-compare.png')
    line(); line(f'Sample text in both fonts: `{os.path.basename(stem)}-compare.png`.')

header = f'# Rule check: {os.path.basename(font_path)}\n\nProject: `{os.path.basename(project_path)}` · checked with HarfBuzz {hb.version_string()}'
open(stem + '-rulecheck.md', 'w', encoding='utf-8').write(header + '\n' + '\n'.join(report) + '\n')
print(header + '\n' + '\n'.join(report))
