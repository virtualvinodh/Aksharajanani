const unicode = require('unicode-properties');

for (let i = 0x0D00; i <= 0x0D07; i++) {
    const category = unicode.getCategory(i);
    console.log(`U+${i.toString(16).toUpperCase().padStart(4, '0')}: Category=${category}`);
}
