const fs = require('fs');
const path = '/data/characters_tamil.json';
let lines = fs.readFileSync(path, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (line.includes('"link"') && !line.includes('"liga"')) {
    let match = line.match(/"link"\s*:\s*(\[[^\]]+\])/);
    if (match) {
      lines[i] = line.replace(match[0], match[0] + ', "liga": ' + match[1]);
    }
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Done');
