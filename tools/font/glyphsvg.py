"""Draw glyphs from a font into one SVG, with the origin (red) and advance width (blue) marked.
Render it with svg2png.cjs.

    uv run --with fonttools python3 tools/font/glyphsvg.py font.otf out.svg "DtBP"
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
f=TTFont(sys.argv[1]); gs=f.getGlyphSet(); cmap=f.getBestCmap()
chars=sys.argv[3]
cells=[]
for i,ch in enumerate(chars):
    g=cmap[ord(ch)]; pen=SVGPathPen(gs); gs[g].draw(pen)
    adv=f['hmtx'][g][0]
    x=i*700+200
    cells.append(f'<g transform="translate({x},900) scale(1,-1)"><line x1="0" y1="-150" x2="0" y2="800" stroke="red"/><line x1="{adv}" y1="-150" x2="{adv}" y2="800" stroke="blue"/><path d="{pen.getCommands()}" fill="black"/></g><text x="{x}" y="1050" font-size="60">{ch} adv={adv}</text>')
open(sys.argv[2],'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {len(chars)*700+200} 1100" width="{len(chars)*140+40}" height="220"><rect width="100%" height="100%" fill="white"/>{"".join(cells)}</svg>')
