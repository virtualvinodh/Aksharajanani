const fs = require('fs');
const path = '/data/characters_tamil.json';
let data = fs.readFileSync(path, 'utf8');

// Use regex to remove "gsub": "..." and any preceding comma and whitespace
// For example: , "gsub": "akhn" -> ""
// Or: , "gsub": "haln"  -> ""
// Or: , "gsub":"akhn" -> ""
// Or: ,  "gsub": "psts" -> ""
// Or: "gsub": "psts", -> ""

// Let's parse JSON, delete the property, and stringify it back.
// But wait, stringify will lose the formatting!
// So regex is better.

data = data.replace(/,\s*"gsub"\s*:\s*"[^"]*"/g, '');
data = data.replace(/"gsub"\s*:\s*"[^"]*"\s*,/g, '');

fs.writeFileSync(path, data);
console.log('Done');
