import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

const dir = path.join(os.homedir(), 'Desktop', 'finance-tracker-sample-files');
const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: node tests/dump-pdfs.mjs <file.pdf> [...]'); process.exit(1); }

for (const file of files) {
  const data = new Uint8Array(fs.readFileSync(path.join(dir, file)));
  const pdf = await pdfjs.getDocument({ data, disableWorker: true, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter(i => i.str?.trim()).sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      return Math.abs(dy) > 4 ? dy : a.transform[4] - b.transform[4];
    });
    let curLine = [], lastY = null;
    const lines = [];
    for (const item of items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        lines.push(curLine.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
        curLine = [];
      }
      curLine.push(item);
      lastY = y;
    }
    if (curLine.length) lines.push(curLine.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
    out += lines.filter(Boolean).join('\n') + '\n';
  }
  console.log('═════════', file, '═════════');
  console.log(out);
}
