"""Data file check: invalid JSON, duplicate keys, unresolved glyph/class references per rules file,
and data files no script in scripts.json uses.

    python3 tools/checks/data-files.py [repo-root]      N=30 shows more unresolved references
"""
import json, os, sys, collections
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); D=os.path.join(ROOT,'data')
dups_report=[]
def load(path):
    def hook(pairs):
        seen=collections.Counter(k for k,_ in pairs)
        for k,c in seen.items():
            if c>1: dups_report.append((os.path.basename(path),k,c))
        return dict(pairs)
    with open(path,encoding='utf-8') as f: return json.load(f,object_pairs_hook=hook)
bad=[]
for fn in sorted(os.listdir(D))+['../scripts.json']:
    if fn.endswith('.json'):
        try: load(os.path.join(D,fn))
        except Exception as e: bad.append((fn,str(e)))
print('INVALID JSON:',bad)
print('DUPLICATE OBJECT KEYS:',len(dups_report)); 
for d in dups_report[:40]: print('  ',d[0],repr(d[1]),'x',d[2], ' U+'+' '.join('%04X'%ord(ch) for ch in d[1]))
sj=load(os.path.join(ROOT,'scripts.json'))
basic=load(os.path.join(D,'characters_basic.json')); latin=load(os.path.join(D,'characters_latin.json'))
def names_of(defs):
    n=[];u=[];sets=set()
    for g in defs:
        if 'characters' in g:
            sets.add(g.get('nameKey'))
            for c in g['characters']:
                n.append(c.get('name')); 
                if c.get('unicode') is not None: u.append((c.get('unicode'),c.get('name')))
    return n,u,sets
bn,_,bsets=names_of(basic); ln,_,lsets=names_of(latin)
for s in sj['scripts']:
    sid=s['id']; issues=[]
    cp=os.path.join(D,f'characters_{sid}.json'); pp=os.path.join(D,f'positioning_{sid}.json'); rp=os.path.join(D,f'rules_{sid}.json'); sp=os.path.join(D,f'sample_{sid}.txt')
    missing=[os.path.basename(p) for p in (cp,pp,rp,sp) if not os.path.exists(p)]
    if s.get('rulesPath') or s.get('rulesFeaPath'): issues.append(f"rulesPath={s.get('rulesPath')} fea={s.get('rulesFeaPath')}")
    if not os.path.exists(cp): print(sid,'NO CHARACTERS FILE'); continue
    chars=load(cp); pos=load(pp) if os.path.exists(pp) else []; rules=load(rp) if os.path.exists(rp) else {}
    n,u,sets=names_of(chars)
    pn,pu,psets=names_of(pos) if isinstance(pos,list) else ([],[],set())
    dn=[k for k,c in collections.Counter(n).items() if c>1]
    uc=collections.defaultdict(list)
    for code,name in u: uc[code].append(name)
    du=[(hex(k),v) for k,v in uc.items() if len(v)>1]
    allnames=set(n)|set(pn)|set(bn)|set(ln)
    groups=set(sets)|bsets|lsets
    if isinstance(pos,list):
        for blk in pos:
            if 'groups' in blk: groups|=set(blk['groups'].keys())
            for k in ('markAttachmentClass','baseAttachmentClass'):
                pass
    if isinstance(rules,dict): groups|=set((rules.get('groups') or {}).keys())
    gdefs={}
    for g in chars+basic+latin:
        if 'characters' in g: gdefs[g.get('nameKey')]=[c.get('name') for c in g['characters']]
    if isinstance(pos,list):
        for blk in pos:
            for k,v in (blk.get('groups') or {}).items(): gdefs[k]=v
    if isinstance(rules,dict):
        for k,v in (rules.get('groups') or {}).items(): gdefs[k]=v
    def expand(x,depth=0):
        if isinstance(x,str) and x[:1] in '$@' and depth<10: 
            out=[]
            for m in gdefs.get(x[1:],[]): out+=expand(m,depth+1)
            return out
        return [x]
    gen=set()
    if isinstance(pos,list):
        for blk in pos:
            for r in blk.get('positioning',[]) or []:
                bs=[b for x in r.get('base',[]) for b in expand(x)]; ms=[m for x in r.get('mark',[]) for m in expand(x)]
                for b in bs:
                    for m in ms: gen.add(str(b)+str(m))
                for bm in (r.get('ligatureMap') or {}).values():
                    gen|=set(bm.values())
    allnames|=gen
    unresolved=collections.Counter()
    def ref(x,where):
        if not isinstance(x,str): return
        if x.startswith('$') or x.startswith('@'):
            if x[1:] not in groups: unresolved[(where,x)]+=1
        elif x not in allnames: unresolved[(where,x)]+=1
    # characters internal refs
    for g in chars:
        for c in g.get('characters',[]):
            for k in ('composite','link','liga'):
                for x in c.get(k) or []: ref(x,'chars.'+k)
    if isinstance(pos,list):
        for blk in pos:
            for gname,members in (blk.get('groups') or {}).items():
                for x in members: ref(x,'pos.groups')
            for r in blk.get('positioning',[]) or []:
                for x in r.get('base',[]): ref(x,'pos.base')
                for x in r.get('mark',[]): ref(x,'pos.mark')
            for b,marks in (blk.get('markAttachment') or {}).items():
                ref(b,'pos.markAttachment.base')
                for m in marks: ref(m,'pos.markAttachment.mark')
            for k in ('markAttachmentClass','baseAttachmentClass'):
                for cl in blk.get(k) or []:
                    for x in (cl.get('members') if isinstance(cl,dict) else cl) or []: ref(x,'pos.'+k)
            for kp in blk.get('recommendedKerning') or []:
                for x in kp[:2] if isinstance(kp,list) else []: ref(x,'pos.recommendedKerning')
    if isinstance(rules,dict):
        for gname,members in (rules.get('groups') or {}).items():
            for x in members: ref(x,'rules.groups')
        def walk_feature(feat,where):
            for rt in ('liga','single','multi','multiple'):
                for out,inp in (feat.get(rt) or {}).items():
                    outs=out.split(',') if rt in('multi','multiple') else [out]
                    for o in outs: ref(o,f'{where}.{rt}.out')
                    for x in inp: ref(x,f'{where}.{rt}.in')
            for out,ctx in (feat.get('context') or {}).items():
                ref(out,f'{where}.context.out')
                for k in ('replace','left','right'):
                    for x in ctx.get(k) or []: ref(x,f'{where}.context.{k}')
            for ch in feat.get('children') or []:
                if ch.get('type')=='lookup' and ch.get('name') not in (rules.get('lookups') or {}): unresolved[(where+'.children','lookup:'+str(ch.get('name')))]+=1
            for ln_ in feat.get('lookups') or []:
                if isinstance(ln_,str) and ln_ not in (rules.get('lookups') or {}): unresolved[(where+'.lookups','lookup:'+ln_)]+=1
        for lname,lk in (rules.get('lookups') or {}).items(): walk_feature(lk,'lookup '+lname)
        for tag,feats in rules.items():
            if tag in ('groups','lookups'): continue
            for ft,feat in feats.items(): walk_feature(feat,f'{tag}.{ft}')
    print(f"== {sid}: chars={len(n)} posGlyphs={len(pn)} missingFiles={missing} {' '.join(issues)}")
    if dn: print('   dup names',len(dn),dn[:10])
    if du: print('   dup unicodes',len(du),du[:10])
    if unresolved:
        print('   unresolved refs',len(unresolved))
        for (w,x),c in list(unresolved.items())[:int(os.environ.get('N','12'))]: print('     ',w,repr(x),'U+'+' '.join('%04X'%ord(ch) for ch in x[:6]) if not x.startswith('lookup') else '', 'x',c)
extra=[f for f in os.listdir(D) if f.endswith('.json') and not any(f in (f'characters_{s["id"]}.json',f'positioning_{s["id"]}.json',f'rules_{s["id"]}.json') for s in sj['scripts'])]
print('DATA FILES NOT REFERENCED BY ANY SCRIPT ID:',sorted(extra))
