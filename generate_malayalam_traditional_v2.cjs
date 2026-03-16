const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/characters_malayalam.json', 'utf8'));

const consonantsGroup = data.find(g => g.nameKey === 'consonants');
const conjunctsGroup = data.find(g => g.nameKey === 'conjuncts');

const consonants = consonantsGroup.characters;
const conjuncts = conjunctsGroup.characters;

const u = "ു";
const U = "ൂ";
const R = "ൃ";
const RR = "ൄ";
const ra = "്ര";

const groups = {
    traditional_cons_u: [], traditional_cons_uu: [], traditional_cons_r: [], traditional_cons_rr: [], traditional_cons_ra: [],
    traditional_conj_u: [], traditional_conj_uu: [], traditional_conj_r: [], traditional_conj_rr: [], traditional_conj_ra: [],
    mini_cons: [], mini_conj: [],
    mini_cons_u: [], mini_cons_uu: [], mini_cons_r: [], mini_cons_rr: [], mini_cons_ra: [],
    mini_conj_u: [], mini_conj_uu: [], mini_conj_r: [], mini_conj_rr: [], mini_conj_ra: []
};

const createMiniature = (baseName, ligaArray) => ({
    name: baseName + ".mini",
    glyphClass: "ligature",
    link: [baseName],
    liga: ["്", ...ligaArray],
    compositeTransform: [{ scale: 0.6, y: 200, mode: "absolute" }]
});

// Miniature Marks
groups.mini_marks = [
    {
        name: u + ".mini",
        glyphClass: "ligature",
        link: [u],
        liga: ["്", u],
        compositeTransform: [{ scale: 0.6, y: 200, mode: "absolute" }]
    },
    {
        name: U + ".mini",
        glyphClass: "ligature",
        link: [U],
        liga: ["്", U],
        compositeTransform: [{ scale: 0.6, y: 200, mode: "absolute" }]
    },
    {
        name: R + ".mini",
        glyphClass: "ligature",
        link: [R],
        liga: ["്", R],
        compositeTransform: [{ scale: 0.6, y: 200, mode: "absolute" }]
    },
    {
        name: RR + ".mini",
        glyphClass: "ligature",
        link: [RR],
        liga: ["്", RR],
        compositeTransform: [{ scale: 0.6, y: 200, mode: "absolute" }]
    }
];

// Consonants
const exclude_u_uu = ["ഖ", "ഘ", "ങ", "ച", "ഝ", "ഞ", "ട", "ഠ", "ഡ", "ഢ", "ഥ", "ദ", "ധ", "പ", "ഫ", "ബ", "മ", "യ", "ല", "വ", "ഷ", "സ", "ഴ", "ള", "റ", "ഩ", "ഺ"];

for (const c of consonants) {
    const baseName = c.name;
    const baseLiga = [baseName];
    
    groups.mini_cons.push(createMiniature(baseName, baseLiga));

    const name_u = baseName + u;
    const liga_u = [baseName, u];
    if (exclude_u_uu.includes(baseName)) {
        groups.traditional_cons_u.push({ 
            name: name_u, 
            glyphClass: "ligature", 
            liga: liga_u,
            position: [baseName, u]
        });
        groups.mini_cons_u.push({ 
            name: name_u + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_u], 
            position: [baseName + ".mini", u + ".mini"] 
        });
    } else {
        groups.traditional_cons_u.push({ name: name_u, glyphClass: "ligature", liga: liga_u });
        groups.mini_cons_u.push(createMiniature(name_u, liga_u));
    }

    const name_U = baseName + U;
    const liga_U = [baseName, U];
    if (exclude_u_uu.includes(baseName)) {
        groups.traditional_cons_uu.push({ 
            name: name_U, 
            glyphClass: "ligature", 
            liga: liga_U,
            position: [baseName, U]
        });
        groups.mini_cons_uu.push({ 
            name: name_U + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_U], 
            position: [baseName + ".mini", U + ".mini"] 
        });
    } else {
        groups.traditional_cons_uu.push({ name: name_U, glyphClass: "ligature", liga: liga_U });
        groups.mini_cons_uu.push(createMiniature(name_U, liga_U));
    }

    const name_R = baseName + R;
    const liga_R = [baseName, R];
    if (exclude_u_uu.includes(baseName)) {
        groups.traditional_cons_r.push({ 
            name: name_R, 
            glyphClass: "ligature", 
            liga: liga_R,
            position: [baseName, R]
        });
        groups.mini_cons_r.push({ 
            name: name_R + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_R], 
            position: [baseName + ".mini", R + ".mini"] 
        });
    } else {
        groups.traditional_cons_r.push({ name: name_R, glyphClass: "ligature", liga: liga_R });
        groups.mini_cons_r.push(createMiniature(name_R, liga_R));
    }

    const name_RR = baseName + RR;
    const liga_RR = [baseName, RR];
    if (exclude_u_uu.includes(baseName)) {
        groups.traditional_cons_rr.push({ 
            name: name_RR, 
            glyphClass: "ligature", 
            liga: liga_RR,
            position: [baseName, RR]
        });
        groups.mini_cons_rr.push({ 
            name: name_RR + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_RR], 
            position: [baseName + ".mini", RR + ".mini"] 
        });
    } else {
        groups.traditional_cons_rr.push({ name: name_RR, glyphClass: "ligature", liga: liga_RR });
        groups.mini_cons_rr.push(createMiniature(name_RR, liga_RR));
    }

    const name_ra = baseName + ra;
    const liga_ra = [baseName, "്", "ര"];
    groups.traditional_cons_ra.push({ name: name_ra, glyphClass: "ligature", liga: liga_ra });
    groups.mini_cons_ra.push(createMiniature(name_ra, liga_ra));
}

// Conjuncts
for (const c of conjuncts) {
    const baseName = c.name;
    const baseLiga = c.liga || [baseName];
    const lastChar = baseLiga[baseLiga.length - 1];
    const isPositioned = exclude_u_uu.includes(lastChar);
    
    groups.mini_conj.push(createMiniature(baseName, baseLiga));

    const name_u = baseName + u;
    const liga_u = c.liga ? [...c.liga, u] : [baseName, u];
    if (isPositioned) {
        groups.traditional_conj_u.push({ 
            name: name_u, 
            glyphClass: "ligature", 
            liga: liga_u,
            position: [baseName, u]
        });
        groups.mini_conj_u.push({ 
            name: name_u + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_u], 
            position: [baseName + ".mini", u + ".mini"] 
        });
    } else {
        groups.traditional_conj_u.push({ name: name_u, glyphClass: "ligature", liga: liga_u });
        groups.mini_conj_u.push(createMiniature(name_u, liga_u));
    }

    const name_U = baseName + U;
    const liga_U = c.liga ? [...c.liga, U] : [baseName, U];
    if (isPositioned) {
        groups.traditional_conj_uu.push({ 
            name: name_U, 
            glyphClass: "ligature", 
            liga: liga_U,
            position: [baseName, U]
        });
        groups.mini_conj_uu.push({ 
            name: name_U + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_U], 
            position: [baseName + ".mini", U + ".mini"] 
        });
    } else {
        groups.traditional_conj_uu.push({ name: name_U, glyphClass: "ligature", liga: liga_U });
        groups.mini_conj_uu.push(createMiniature(name_U, liga_U));
    }

    const name_R = baseName + R;
    const liga_R = c.liga ? [...c.liga, R] : [baseName, R];
    if (isPositioned) {
        groups.traditional_conj_r.push({ 
            name: name_R, 
            glyphClass: "ligature", 
            liga: liga_R,
            position: [baseName, R]
        });
        groups.mini_conj_r.push({ 
            name: name_R + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_R], 
            position: [baseName + ".mini", R + ".mini"] 
        });
    } else {
        groups.traditional_conj_r.push({ name: name_R, glyphClass: "ligature", liga: liga_R });
        groups.mini_conj_r.push(createMiniature(name_R, liga_R));
    }

    const name_RR = baseName + RR;
    const liga_RR = c.liga ? [...c.liga, RR] : [baseName, RR];
    if (isPositioned) {
        groups.traditional_conj_rr.push({ 
            name: name_RR, 
            glyphClass: "ligature", 
            liga: liga_RR,
            position: [baseName, RR]
        });
        groups.mini_conj_rr.push({ 
            name: name_RR + ".mini", 
            glyphClass: "ligature", 
            liga: ["്", ...liga_RR], 
            position: [baseName + ".mini", RR + ".mini"] 
        });
    } else {
        groups.traditional_conj_rr.push({ name: name_RR, glyphClass: "ligature", liga: liga_RR });
        groups.mini_conj_rr.push(createMiniature(name_RR, liga_RR));
    }

    const name_ra = baseName + ra;
    const liga_ra = c.liga ? [...c.liga, "്", "ര"] : [baseName, "്", "ര"];
    groups.traditional_conj_ra.push({ name: name_ra, glyphClass: "ligature", liga: liga_ra });
    groups.mini_conj_ra.push(createMiniature(name_ra, liga_ra));
}

// Append to data
for (const [key, chars] of Object.entries(groups)) {
    if (chars.length > 0) {
        data.push({
            nameKey: key,
            characters: chars
        });
    }
}

fs.writeFileSync('data/characters_malayalam_traditional.json', JSON.stringify(data, null, 2));
console.log('Done generating groups.');
