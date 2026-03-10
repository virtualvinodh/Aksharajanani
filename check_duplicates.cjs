const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/characters_malayalam.json', 'utf8'));

const names = new Set();
const unicodes = new Set();
const duplicateNames = [];
const duplicateUnicodes = [];

function check(chars) {
    if (!chars) return;
    for (const char of chars) {
        if (char.name) {
            if (names.has(char.name)) {
                duplicateNames.push(char.name);
            }
            names.add(char.name);
        }
        if (char.unicode) {
            if (unicodes.has(char.unicode)) {
                duplicateUnicodes.push(char.unicode);
            }
            unicodes.add(char.unicode);
        }
    }
}

for (const group of data) {
    check(group.characters);
}

console.log('Duplicate names:', duplicateNames);
console.log('Duplicate unicodes:', duplicateUnicodes);
