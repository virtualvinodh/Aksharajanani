"""Script data check over every script in scripts.json.

For each script: characters / positioning / rules files load; every glyph that rules, positioning,
kerning and composites refer to is defined; classes resolve; marks are classed as marks; outputs
of substitutions exist. Prints a per-script summary of what doesn't resolve.

    python3 tools/checks/script-data.py [repo-root]
"""
import json, os, re, sys, unicodedata
from collections import Counter, defaultdict
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
D = lambda f: os.path.join(ROOT, 'data', f)
scripts = json.load(open(os.path.join(ROOT, 'scripts.json')))
scripts = scripts if isinstance(scripts, list) else scripts.get('scripts', scripts)
SPECIAL = {'zwj', 'zwnj', '‍', '‌'}
def script_word(ch):
    try: return unicodedata.name(ch).split()[0]
    except ValueError: return None
def load(path):
    if not os.path.exists(path): return None
    return json.load(open(path))
def walk_defs(defs):
    """Yield (setName, char) from a characters/positioning definition list."""
    for item in defs or []:
        if isinstance(item, dict) and 'characters' in item:
            for c in item['characters']: yield item.get('nameKey'), c
results = {}
for s in scripts:
    sid = s['id']; probs = defaultdict(list)
    chars_def = load(D(f'characters_{sid}.json')); pos_def = load(D(f'positioning_{sid}.json')); rules = load(D(f'rules_{sid}.json'))
    if chars_def is None: probs['missing file'].append(f'characters_{sid}.json'); results[sid]=probs; continue
    entries = list(walk_defs(chars_def)) + list(walk_defs(pos_def))
    names = Counter(); cps = defaultdict(list); defined = set()
    set_names = {d.get('nameKey') for d in chars_def if isinstance(d, dict) and 'characters' in d}
    for setname, c in entries:
        n = c.get('name')
        if not n: probs['entry without name'].append(json.dumps(c, ensure_ascii=False)[:80]); continue
        names[n] += 1; defined.add(n)
        cp = c.get('unicode')
        if cp is None and len([*n]) == 1: cp = ord(n)
        elif cp is not None and len([*n]) == 1 and ord(n) != cp and not (0xE000 <= ord(n) <= 0xF8FF):
            probs['unicode differs from name'].append(f'{n!r} name=U+{ord(n):04X} unicode=U+{cp:04X}')
        if cp is not None: cps[cp].append(n)
        try: cat = unicodedata.category(chr(cp)) if cp is not None else None
        except Exception: cat = None
        cls = c.get('glyphClass') or 'base'
        if cat == 'Mn' and cls != 'mark': probs['non-spacing mark not classed as mark'].append(f'{n!r} U+{cp:04X} class={cls}')
        if c.get('advWidth') in (0, '0') and cls not in ('mark', 'virtual'): probs['zero width but not a mark'].append(f'{n!r} class={cls}')
    for n, k in names.items():
        if k > 1: probs['duplicate name'].append(f'{n!r} ×{k}')
    for cp, ns in cps.items():
        if len(ns) > 1: probs['duplicate code point'].append(f'U+{cp:04X}: {ns}')
    groups = {}
    for item in (pos_def or []):
        if isinstance(item, dict) and 'groups' in item: groups.update(item['groups'])
    if rules and isinstance(rules.get('groups'), dict): groups.update(rules['groups'])
    def known(ref):
        if not ref or ref in SPECIAL: return True
        if ref.startswith(('$', '@')): return ref[1:] in groups or ref[1:] in set_names
        return ref in defined
    def need(kind, where, ref):
        if isinstance(ref, str) and not known(ref): probs[kind].append(f'{where}: {ref!r}')
    for setname, c in entries:
        for key in ('composite', 'link', 'position', 'kern', 'liga'):
            for comp in c.get(key) or []: need(f'undefined {key} component', c.get('name'), comp)
    for g, members in groups.items():
        for m in members or []: need('undefined group member', f'${g}', m)
    if rules:
        def rule_blocks():
            for tag, feats in rules.items():
                if tag in ('groups',): continue
                if tag == 'lookups':
                    for ln, block in (feats or {}).items(): yield f'lookup {ln}', block
                elif isinstance(feats, dict):
                    for ft, block in feats.items(): yield f'{tag}/{ft}', block
        for where, block in rule_blocks():
            if not isinstance(block, dict): continue
            for out, comps in (block.get('liga') or {}).items():
                need('undefined rule output', f'{where} liga', out)
                for x in comps: need('undefined rule input', f'{where} liga {out!r}', x)
            for out, inp in (block.get('single') or {}).items():
                need('undefined rule output', f'{where} single', out)
                for x in (inp if isinstance(inp, list) else [inp]): need('undefined rule input', f'{where} single {out!r}', x)
            for out, inp in (block.get('multi') or {}).items():
                for x in (out.split(',') if isinstance(out, str) else []): need('undefined rule output', f'{where} multi', x.strip())
                for x in (inp if isinstance(inp, list) else [inp]): need('undefined rule input', f'{where} multi', x)
            for out, rule in (block.get('context') or {}).items():
                need('undefined rule output', f'{where} context', out)
                for part in ('left', 'replace', 'right'):
                    for x in (rule or {}).get(part) or []: need('undefined rule input', f'{where} context {out!r}', x)
    for item in (pos_def or []):
        if not isinstance(item, dict): continue
        for r in item.get('positioning') or []:
            for x in (r.get('base') or []) + (r.get('mark') or []): need('undefined positioning member', 'positioning rule', x)
        for b, marks in (item.get('markAttachment') or {}).items():
            need('undefined attachment base', 'markAttachment', b)
            for m in (marks or {}): need('undefined attachment mark', f'markAttachment {b!r}', m)
        for pair in item.get('recommendedKerning') or []:
            for x in pair[:2]: need('undefined recommended kerning glyph', 'recommendedKerning', x)
        for cls in (item.get('markAttachmentClass') or []) + (item.get('baseAttachmentClass') or []):
            for x in cls.get('members') or []: need('undefined attachment class member', 'attachment class', x)
    # characters from another script
    words = Counter()
    for n in defined:
        for ch in n:
            if unicodedata.category(ch)[0] == 'L': words[script_word(ch)] += 1
    main = {w for w, k in words.most_common(2)} | {'LATIN'}
    for setname, c in entries:
        n = c.get('name') or ''
        for ch in n:
            cat = unicodedata.category(ch)
            if cat[0] in 'LM' and not (0xE000 <= ord(ch) <= 0xF8FF) and script_word(ch) not in main | {'COMBINING', 'MODIFIER', 'DOTTED'}:
                probs['character from another script'].append(f'{n!r} ({unicodedata.name(ch, "?")}) in {setname}'); break
    results[sid] = probs
EUROPE = [s['id'] for s in scripts if s.get('region') == 'europe']
order = EUROPE + [s['id'] for s in scripts if s['id'] not in EUROPE]
for sid in order:
    probs = results[sid]; total = sum(len(v) for v in probs.values())
    tag = ' (Europe)' if sid in EUROPE else ''
    print(f'\n=== {sid}{tag}: {"OK" if total == 0 else f"{total} problem(s)"}')
    for kind, items in probs.items():
        print(f'  {kind} ({len(items)}): ' + '; '.join(items[:6]) + (' …' if len(items) > 6 else ''))
