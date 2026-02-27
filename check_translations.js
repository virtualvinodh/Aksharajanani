const fs = require('fs');
const path = require('path');

// 1. Load defined keys
const definedKeys = new Set();

function loadKeys(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(content);
            Object.keys(json).forEach(key => definedKeys.add(key));
        } catch (e) {
            console.error(`Error reading ${filePath}:`, e);
        }
    }
}

loadKeys('./locales/en.json');
loadKeys('./locales/help/en.json');
loadKeys('./locales/tutorial/en.json');

// 2. Scan for used keys
const usedKeys = new Set();
const usedLocations = {}; // key -> [file:line]

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Regex for t('key') or t("key")
    // We also handle cases like t('key', { ... })
    const regex = /\bt\(['"]([a-zA-Z0-9_.-]+)['"]/g;
    
    lines.forEach((line, index) => {
        let match;
        while ((match = regex.exec(line)) !== null) {
            const key = match[1];
            usedKeys.add(key);
            if (!usedLocations[key]) {
                usedLocations[key] = [];
            }
            usedLocations[key].push(`${filePath}:${index + 1}`);
        }
    });
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'locales' && file !== 'build') {
                walkDir(filePath);
            }
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                scanFile(filePath);
            }
        }
    });
}

walkDir('.');

// 3. Find missing keys
const missingKeys = [];
usedKeys.forEach(key => {
    if (!definedKeys.has(key)) {
        missingKeys.push(key);
    }
});

// 4. Report
console.log('Missing Translation Keys:');
if (missingKeys.length === 0) {
    console.log('None found.');
} else {
    missingKeys.sort().forEach(key => {
        console.log(`- ${key}`);
        // console.log(`  Used in:`);
        // usedLocations[key].forEach(loc => console.log(`    ${loc}`));
    });
}
