const fs=require('fs'),path=require('path');
// Locale parity: duplicate keys, keys missing/extra in Tamil, empty or untranslated values, {placeholder} mismatches.
//   node tools/checks/locales.cjs [repo-root]
const ROOT=process.argv[2]||path.join(__dirname,'..','..');
const L=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'locales',f),'utf8'));
// duplicate keys at top level via regex on raw text
function dupKeys(f){const txt=fs.readFileSync(path.join(ROOT,'locales',f),'utf8');const seen={},d=[];for(const m of txt.matchAll(/^\s*"([^"]+)"\s*:/gm)){if(seen[m[1]])d.push(m[1]);seen[m[1]]=1}return d}
function flat(o,p=''){let r={};for(const[k,v]of Object.entries(o)){const kk=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(r,flat(v,kk));else r[kk]=v}return r}
for(const f of ['en.json','ta.json','help/en.json','help/ta.json','tutorial/en.json','tutorial/ta.json']){const d=dupKeys(f);console.log('dupkeys',f,d.length,d.slice(0,15).join(','))}
for(const [a,b] of [['en.json','ta.json'],['help/en.json','help/ta.json'],['tutorial/en.json','tutorial/ta.json']]){
 const A=flat(L(a)),B=flat(L(b));const miss=Object.keys(A).filter(k=>!(k in B));const extra=Object.keys(B).filter(k=>!(k in A));
 const empty=Object.keys(B).filter(k=>B[k]==='');
 const same=Object.keys(A).filter(k=>k in B && A[k]===B[k] && /[a-z]{4,}/.test(A[k]));
 console.log(`${b}: missing ${miss.length} vs ${a} [${miss.slice(0,25).join(', ')}]; extra ${extra.length} [${extra.slice(0,10).join(', ')}]; empty ${empty.length}; identical-to-en ${same.length} [${same.slice(0,10).join(', ')}]`);
 // placeholder mismatch
 const ph=s=>(String(s).match(/\{[a-zA-Z0-9_]+\}/g)||[]).sort().join();
 const pm=Object.keys(A).filter(k=>k in B && ph(A[k])!==ph(B[k]));console.log(`  placeholder mismatches ${pm.length}: ${pm.slice(0,10).map(k=>k+' en='+ph(A[k])+' ta='+ph(B[k])).join(' | ')}`);
}
const en=L('en.json');
// scan code
const used={},dyn=[];
function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(['node_modules','.git','dist','locales','scripts'].includes(f))continue;const st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(tsx?|jsx?)$/.test(f)){const lines=fs.readFileSync(p,'utf8').split('\n');lines.forEach((ln,i)=>{for(const m of ln.matchAll(/\bt\(\s*(['"`])([^'"`$]+?)\1/g)){(used[m[2]]=used[m[2]]||[]).push(path.relative(ROOT,p)+':'+(i+1))}for(const m of ln.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g))dyn.push(path.relative(ROOT,p)+':'+(i+1)+' '+m[1]);for(const m of ln.matchAll(/\b(?:labelKey|titleKey|nameKey|descriptionKey|textKey|messageKey|tooltipKey|contentKey|i18nKey)\s*:\s*['"]([^'"]+)['"]/g)){(used[m[1]]=used[m[1]]||[]).push(path.relative(ROOT,p)+':'+(i+1)+'(prop)')}})}}}
walk(ROOT);
const sj=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts.json'),'utf8'));for(const s of sj.scripts){for(const k of ['nameKey','descriptionKey'])if(s[k])(used[s[k]]=used[s[k]]||[]).push('scripts.json:'+s.id)}
const enKeys=new Set(Object.keys(en));
const missing=Object.keys(used).filter(k=>!enKeys.has(k)&&!/\s/.test(k)&&k.length>1);
console.log('\nused static keys',Object.keys(used).length,'missing in en.json',missing.length);
missing.sort().forEach(k=>console.log('  MISSING',k,used[k].slice(0,3).join(' ')));
console.log('\ndynamic t() calls',dyn.length);dyn.forEach(x=>console.log('  ',x));
const unused=[...enKeys].filter(k=>!used[k]);console.log('\nen keys never referenced statically:',unused.length);
