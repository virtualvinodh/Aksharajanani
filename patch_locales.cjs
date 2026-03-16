const fs = require('fs');

function patchLocale(path, isTamil) {
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));

    const newKeys = {
        "mini_conj": isTamil ? "சிறிய கூட்டெழுத்துக்கள்" : "Miniature Conjuncts",
        "mini_conj_r": isTamil ? "சிறிய கூட்டெழுத்துக்கள் + ரு" : "Miniature Conjuncts + r",
        "mini_conj_ra": isTamil ? "சிறிய கூட்டெழுத்துக்கள் + ர" : "Miniature Conjuncts + ra",
        "mini_conj_rr": isTamil ? "சிறிய கூட்டெழுத்துக்கள் + ரூ" : "Miniature Conjuncts + rr",
        "mini_conj_u": isTamil ? "சிறிய கூட்டெழுத்துக்கள் + உ" : "Miniature Conjuncts + u",
        "mini_conj_uu": isTamil ? "சிறிய கூட்டெழுத்துக்கள் + ஊ" : "Miniature Conjuncts + uu",
        "mini_cons": isTamil ? "சிறிய மெய்யெழுத்துக்கள்" : "Miniature Consonants",
        "mini_cons_r": isTamil ? "சிறிய மெய்யெழுத்துக்கள் + ரு" : "Miniature Consonants + r",
        "mini_cons_ra": isTamil ? "சிறிய மெய்யெழுத்துக்கள் + ர" : "Miniature Consonants + ra",
        "mini_cons_rr": isTamil ? "சிறிய மெய்யெழுத்துக்கள் + ரூ" : "Miniature Consonants + rr",
        "mini_cons_u": isTamil ? "சிறிய மெய்யெழுத்துக்கள் + உ" : "Miniature Consonants + u",
        "mini_cons_uu": isTamil ? "சிறிய மெய்யெழுத்துக்கள் + ஊ" : "Miniature Consonants + uu",
        "traditional_conj_r": isTamil ? "பாரம்பரிய கூட்டெழுத்துக்கள் + ரு" : "Traditional Conjuncts + r",
        "traditional_conj_ra": isTamil ? "பாரம்பரிய கூட்டெழுத்துக்கள் + ர" : "Traditional Conjuncts + ra",
        "traditional_conj_rr": isTamil ? "பாரம்பரிய கூட்டெழுத்துக்கள் + ரூ" : "Traditional Conjuncts + rr",
        "traditional_conj_u": isTamil ? "பாரம்பரிய கூட்டெழுத்துக்கள் + உ" : "Traditional Conjuncts + u",
        "traditional_conj_uu": isTamil ? "பாரம்பரிய கூட்டெழுத்துக்கள் + ஊ" : "Traditional Conjuncts + uu",
        "traditional_cons_r": isTamil ? "பாரம்பரிய மெய்யெழுத்துக்கள் + ரு" : "Traditional Consonants + r",
        "traditional_cons_ra": isTamil ? "பாரம்பரிய மெய்யெழுத்துக்கள் + ர" : "Traditional Consonants + ra",
        "traditional_cons_rr": isTamil ? "பாரம்பரிய மெய்யெழுத்துக்கள் + ரூ" : "Traditional Consonants + rr",
        "traditional_cons_u": isTamil ? "பாரம்பரிய மெய்யெழுத்துக்கள் + உ" : "Traditional Consonants + u",
        "traditional_cons_uu": isTamil ? "பாரம்பரிய மெய்யெழுத்துக்கள் + ஊ" : "Traditional Consonants + uu"
    };

    Object.assign(data, newKeys);

    const sortedData = {};
    Object.keys(data).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(key => {
        sortedData[key] = data[key];
    });

    fs.writeFileSync(path, JSON.stringify(sortedData, null, '\t') + '\n');
    console.log(`Patched ${path}`);
}

patchLocale('locales/en.json', false);
patchLocale('locales/ta.json', true);
