"""Dump a font's pair kerning: metrics of a few glyphs, the most negative pairs, any positive ones,
and the pairs for `t` and `D` on the left (edit the names below for other glyphs).

    uv run --with fonttools python3 tools/font/kerndump.py font.otf
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
f=TTFont(sys.argv[1]); gs=f.getGlyphSet(); hm=f['hmtx']
def b(g):
    bp=BoundsPen(gs); gs[g].draw(bp); return bp.bounds
for g in ['uni0074','uni0044','uni0065','uni006F','uni0041','uni0056']:
    print(g, 'adv',hm[g][0],'lsb',hm[g][1],'bounds',b(g))
pairs=[]
for lk in f['GPOS'].table.LookupList.Lookup:
    for st in lk.SubTable:
        if st.LookupType==9: st=st.ExtSubTable
        if getattr(st,'Format',None)==1 and hasattr(st,'PairSet'):
            for g1,ps in zip(st.Coverage.glyphs, st.PairSet):
                for r in ps.PairValueRecord:
                    v=getattr(r.Value1,'XAdvance',0)
                    pairs.append((v,g1,r.SecondGlyph))
        elif getattr(st,'Format',None)==2:
            print('class kerning subtable present')
pairs.sort()
print(len(pairs),'pairs; most negative:', pairs[:15])
print('positive:', [p for p in pairs if p[0]>0][:10])
from collections import Counter
print('t as left:', [p for p in pairs if p[1]=='uni0074'][:10])
print('D as left:', [p for p in pairs if p[1]=='uni0044'][:10])
