import fs from 'fs';
import https from 'https';

const syllabicUrl = 'https://www.unicode.org/Public/16.0.0/ucd/IndicSyllabicCategory.txt';
const positionalUrl = 'https://www.unicode.org/Public/17.0.0/ucd/IndicPositionalCategory.txt';

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseData(data: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = data.split('\n');
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const parts = line.split(';');
    if (parts.length < 2) continue;
    
    const rangeStr = parts[0].trim();
    const category = parts[1].split('#')[0].trim();
    
    if (rangeStr.includes('..')) {
      const [startStr, endStr] = rangeStr.split('..');
      const start = parseInt(startStr, 16);
      const end = parseInt(endStr, 16);
      for (let i = start; i <= end; i++) {
        map.set(i, category);
      }
    } else {
      map.set(parseInt(rangeStr, 16), category);
    }
  }
  return map;
}

async function main() {
  console.log('Fetching Syllabic Categories...');
  const syllabicData = await fetchUrl(syllabicUrl);
  const syllabicMap = parseData(syllabicData);
  
  console.log('Fetching Positional Categories...');
  const positionalData = await fetchUrl(positionalUrl);
  const positionalMap = parseData(positionalData);
  
  const combined: Record<number, { s: string | null, p: string | null }> = {};
  
  const allKeys = new Set([...syllabicMap.keys(), ...positionalMap.keys()]);
  
  for (const key of allKeys) {
    combined[key] = {
      s: syllabicMap.get(key) || null,
      p: positionalMap.get(key) || null
    };
  }
  
  const tsContent = `// Auto-generated from Unicode Data
export interface IndicCategory {
  isIndic: boolean;
  syllabic: string | null;
  positional: string | null;
}

const data: Record<number, { s: string | null, p: string | null }> = ${JSON.stringify(combined)};

export const getIndicCategory = (charOrCode: string | number): IndicCategory => {
  const code = typeof charOrCode === 'string' ? charOrCode.codePointAt(0) : charOrCode;
  if (code === undefined) return { isIndic: false, syllabic: null, positional: null };
  const entry = data[code];
  if (!entry) return { isIndic: false, syllabic: null, positional: null };
  return { isIndic: true, syllabic: entry.s, positional: entry.p };
};
`;

  fs.writeFileSync('./utils/indicCategoryUtils.ts', tsContent);
  console.log('Generated utils/indicCategoryUtils.ts');
}

main().catch(console.error);
