"""Inspect an exported font: tables, glyph count, glyphs with empty outlines, GSUB/GPOS features,
and how HarfBuzz shapes the given strings (glyph, advance, x/y offset).

    uv run --with fonttools --with uharfbuzz python3 tools/font/fontcheck.py font.otf "To" "ñ"
"""
import sys, uharfbuzz as hb
from fontTools.ttLib import TTFont
path=sys.argv[1]
f=TTFont(path)
cmap=f.getBestCmap(); go=f.getGlyphOrder()
print("tables:", sorted(f.keys()))
print("glyphs:", len(go), "cmap:", len(cmap))
gs=f.getGlyphSet()
from fontTools.pens.boundsPen import BoundsPen
empty=[]
for cp,g in sorted(cmap.items()):
    if chr(cp) in ' ‌‍': continue
    bp=BoundsPen(gs); gs[g].draw(bp)
    if bp.bounds is None: empty.append(chr(cp))
print("empty outlines:", empty)
for tag in ('GSUB','GPOS'):
    if tag in f:
        t=f[tag].table
        print(tag, "features:", sorted({fr.FeatureTag for fr in t.FeatureList.FeatureRecord}), "lookups:", len(t.LookupList.Lookup))
blob=hb.Blob.from_file_path(path); face=hb.Face(blob); font=hb.Font(face)
def shape(s, feats=None):
    buf=hb.Buffer(); buf.add_str(s); buf.guess_segment_properties(); hb.shape(font,buf,feats or {})
    return [(font.glyph_to_string(i.codepoint), p.x_advance, p.x_offset, p.y_offset) for i,p in zip(buf.glyph_infos, buf.glyph_positions)]
for s in sys.argv[2:]:
    print(repr(s), shape(s))
