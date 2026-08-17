const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function main() {
  const filePath = process.argv[2];
  const password = process.argv[3] || '';
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, password }).promise;
  console.log(`Pages: ${doc.numPages}\n`);

  for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rowMap = new Map();
    for (const item of content.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      if (!rowMap.has(y)) rowMap.set(y, []);
      rowMap.get(y).push({ x: item.transform[4], str });
    }
    const sortedY = [...rowMap.keys()].sort((a, b) => b - a);
    console.log(`--- Page ${i} ---`);
    for (const y of sortedY) {
      const items = rowMap.get(y).sort((a, b) => a.x - b.x);
      console.log(items.map(it => `[x=${Math.round(it.x)}]${it.str}`).join(' | '));
    }
  }
}
main().catch(e => console.error('ERROR:', e.message));
