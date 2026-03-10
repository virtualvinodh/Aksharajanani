const fs = require('fs');
const content = fs.readFileSync('data/characters_malayalam.json', 'utf8');

const lines = content.split('\n');
let hasDuplicates = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nameMatches = line.match(/"name"\s*:/g);
    if (nameMatches && nameMatches.length > 1) {
        console.log(`Duplicate "name" key on line ${i + 1}: ${line}`);
        hasDuplicates = true;
    }
    const unicodeMatches = line.match(/"unicode"\s*:/g);
    if (unicodeMatches && unicodeMatches.length > 1) {
        console.log(`Duplicate "unicode" key on line ${i + 1}: ${line}`);
        hasDuplicates = true;
    }
}

if (!hasDuplicates) {
    console.log('No duplicate keys found within the same object.');
}
