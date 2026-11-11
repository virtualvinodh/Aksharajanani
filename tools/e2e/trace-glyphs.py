"""Turn a font's letters into pen strokes for the end-to-end test (tools/e2e/e2e.cjs).

Each glyph the script defines is shaped with the font (so ligatures like கு come out as the
font draws them), rendered, thinned down to its centre line, and traced into strokes: lists of
[x, y] points in the app's canvas units (1000 x 1000, x relative to the centre), the same format
as e2e/alphabet.cjs. The strokes are placed on the script's own guide lines.

    uv run --with fonttools --with uharfbuzz --with freetype-py --with scikit-image --with pillow \\
        python3 tools/e2e/trace-glyphs.py tamil [font.otf] [reference-glyph]

Without a font it downloads the script's guide font (guideFont in scripts.json).
Writes tools/e2e/strokes/<script>.json and a preview, tools/e2e/out/trace-<script>.png.
Strokes are placed exactly where the editor draws its guide letter (same size and position), so
signs keep their place next to the letter. Scripts without a grid name size instead scale the
reference glyph (default: the first letter outside ASCII) to fill their top line to baseline. Glyphs the font lacks are listed; give them
hand-drawn strokes in alphabet.cjs instead.
"""
import json, os, re, sys
import numpy as np
import freetype, uharfbuzz as hb
from skimage.morphology import skeletonize
from skimage.measure import label

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('REPO') or os.path.abspath(os.path.join(HERE, '..', '..'))
HERE = os.environ.get('OUT_DIR') or HERE  # where strokes/ and out/ go
script_id = sys.argv[1]
font_path = sys.argv[2] if len(sys.argv) > 2 else None
ref = sys.argv[3] if len(sys.argv) > 3 else None

scripts = json.load(open(os.path.join(REPO, 'scripts.json')))
scripts = scripts if isinstance(scripts, list) else next(v for v in scripts.values() if isinstance(v, list))
script = next(s for s in scripts if s['id'] == script_id)
metrics = script['metrics']
if not font_path:
    import urllib.request
    url = script['guideFont']['fontUrl']
    font_path = os.path.join(HERE, 'out', 'fonts', os.path.basename(url))
    if not os.path.exists(font_path):
        os.makedirs(os.path.dirname(font_path), exist_ok=True)
        print('downloading', url); urllib.request.urlretrieve(url, font_path)
TOP, BASE = metrics['topLineY'], metrics['baseLineY']

def load(name):
    p = os.path.join(REPO, 'data', name)
    return [c for st in json.load(open(p)) if 'characters' in st for c in st['characters']] if os.path.exists(p) else []
chars = load(f'characters_{script_id}.json') + load('characters_basic.json')

blob = hb.Blob.from_file_path(font_path); face = hb.Face(blob); hbfont = hb.Font(face)
upm = face.upem
ft = freetype.Face(font_path)

def shape(text):
    # Shaped the way the browser shapes the editor's guide letter: a sign on its own gets a
    # dotted circle in front of it, which takes up room (it's left out when rendering below).
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {})
    return list(zip(buf.glyph_infos, buf.glyph_positions))

DOTTED = hbfont.get_nominal_glyph(0x25CC)

def glyph_top(text):
    top = None
    for info, _ in shape(text):
        ext = hbfont.get_glyph_extents(info.codepoint)
        if ext: top = max(top or 0, ext.y_bearing)
    return top

if ref is None:
    ref = next((c['name'] for c in chars if c.get('glyphClass', 'base') == 'base' and len(c['name']) == 1 and ord(c['name']) > 0x7f), 'x')
# Same size as the editor's guide letter (the grid's characterNameSize, in canvas units per em),
# so the strokes land exactly on it. Without one, scale the reference glyph to the guide lines.
name_size = (script.get('grid') or {}).get('characterNameSize')
scale = name_size / upm if name_size else (BASE - TOP) / glyph_top(ref)  # canvas units per font unit
PX = 0.5                                     # pixels per canvas unit
ppu = scale * PX                             # pixels per font unit
ft.set_char_size(int(upm * ppu * 64), 0, 72, 72)

def render(text):
    """Rasterise the text on the 1000 x 1000 canvas where the editor draws its guide letter:
    centred on its advance at x = 500, on the baseline."""
    W = int(1000 * PX); img = np.zeros((W, W), dtype=np.uint8)
    run = shape(text)
    origin = 500 - sum(pos.x_advance for _, pos in run) * scale / 2  # canvas x of the pen start
    pen = 0; drew = False
    for info, pos in run:
        if info.codepoint == 0: return None  # the font doesn't have it
        if info.codepoint == DOTTED and '\u25cc' not in text: pen += pos.x_advance; continue
        ft.load_glyph(info.codepoint, freetype.FT_LOAD_DEFAULT | freetype.FT_LOAD_NO_HINTING)
        ft.glyph.render(freetype.FT_RENDER_MODE_NORMAL)
        bm = ft.glyph.bitmap
        if bm.width and bm.rows:
            a = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)[:, :bm.width]
            x0 = int(round(origin * PX + (pen + pos.x_offset) * ppu)) + ft.glyph.bitmap_left
            y0 = int(round(BASE * PX - pos.y_offset * ppu)) - ft.glyph.bitmap_top
            ys, xs = slice(max(0, y0), min(W, y0 + bm.rows)), slice(max(0, x0), min(W, x0 + bm.width))
            img[ys, xs] = np.maximum(img[ys, xs], a[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0])
            drew = True
        pen += pos.x_advance
    return img if drew else None

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

def trace(skel):
    """Skeleton pixels -> polylines, walking from ends and junctions; leftover loops last."""
    pts = set(zip(*np.nonzero(skel)))
    nb = {p: [(p[0] + dy, p[1] + dx) for dy, dx in N8 if (p[0] + dy, p[1] + dx) in pts] for p in pts}
    nodes = {p for p in pts if len(nb[p]) != 2}
    used = set(); paths = []
    def walk(a, b):
        path = [a, b]; used.add(frozenset((a, b)))
        prev, cur = a, b
        while cur not in nodes:
            nxt = [q for q in nb[cur] if q != prev and frozenset((cur, q)) not in used]
            if not nxt: break
            prev, cur = cur, nxt[0]; used.add(frozenset((prev, cur))); path.append(cur)
            if cur == a: break
        return path
    for n in sorted(nodes):
        for q in nb[n]:
            if frozenset((n, q)) not in used: paths.append(walk(n, q))
    for p in sorted(pts):  # closed loops with no end or junction (an o)
        for q in nb[p]:
            if frozenset((p, q)) not in used: paths.append(walk(p, q))
    return paths

def rdp(points, eps):
    if len(points) < 3: return points
    a, b = np.array(points[0], float), np.array(points[-1], float)
    d = b - a; n = np.hypot(*d)
    dist = [abs(d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / n if n else np.hypot(p[0] - a[0], p[1] - a[1]) for p in points]
    i = int(np.argmax(dist))
    if dist[i] > eps: return rdp(points[:i + 1], eps)[:-1] + rdp(points[i:], eps)
    return [points[0], points[-1]]

def strokes_for(text):
    img = render(text)
    if img is None: return None
    ink = img > 110
    if not ink.any(): return None
    cx = 500 * PX  # canvas centre; strokes are stored relative to it
    out = []
    lab = label(ink, connectivity=2)
    for k in range(1, lab.max() + 1):  # each separate piece of ink on its own
        comp = lab == k
        kept = []
        for path in trace(skeletonize(comp)):
            if len(path) < 6: continue  # spurs and junction crumbs
            pl = rdp([(float(x), float(y)) for y, x in path], 1.0)
            kept.append([[round((x - cx) / PX), round(y / PX)] for x, y in pl])
        if not kept:  # a dot (its centre line is only a few pixels long)
            ys, xs = np.nonzero(comp)
            x, y = round((xs.mean() - cx) / PX), round(ys.mean() / PX)
            kept = [[[x, y], [x, y + 8]]]
        out += kept
    return out or None

result, missing = {}, []
for c in chars:
    name = c['name']
    if c.get('position') or c.get('link') or c.get('hidden'): continue
    if len(name) > 1 and re.fullmatch(r'[A-Za-z]+', name): continue  # named controls (zwj)
    s = strokes_for(c.get('label') or name)  # the editor's guide shows the label if there is one
    if s: result[name] = s
    else: missing.append(name)

os.makedirs(os.path.join(HERE, 'strokes'), exist_ok=True)
with open(os.path.join(HERE, 'strokes', f'{script_id}.json'), 'w') as f:
    json.dump({'font': os.path.basename(font_path), 'reference': ref, 'strokes': result}, f, ensure_ascii=False, separators=(',', ':'))
print(f'{script_id}: traced {len(result)} glyphs; not in the font: {" ".join(missing) or "none"}')

# Preview: every traced glyph drawn as its strokes, with the top line and baseline.
try:
    from PIL import Image, ImageDraw
    names = list(result); per = 14; cell = 110
    im = Image.new('RGB', (per * cell, ((len(names) + per - 1) // per) * cell), 'white'); d = ImageDraw.Draw(im)
    for i, n in enumerate(names):
        ox, oy = (i % per) * cell, (i // per) * cell; s = cell / 1000
        for yy in (TOP, BASE): d.line([(ox, oy + yy * s), (ox + cell, oy + yy * s)], fill=(210, 210, 255))
        for st in result[n]:
            d.line([(ox + (500 + x) * s, oy + y * s) for x, y in st], fill='black', width=2) if len(st) > 1 else None
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    im.save(os.path.join(HERE, 'out', f'trace-{script_id}.png'))
except ImportError:
    pass
