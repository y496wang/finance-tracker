// Browser-only PDF.js text extraction. Re-exports the Node-safe parsers
// from ./pdfParse so consumers only import from one place.

import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { parsePDFByBank } from './pdfParse';

export async function extractPDFText(fileOrBlob) {
  const buffer = await fileOrBlob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Sort top-to-bottom, left-to-right using transform coords
    const items = content.items
      .filter(i => i.str?.trim())
      .sort((a, b) => {
        const dy = b.transform[5] - a.transform[5];
        return Math.abs(dy) > 4 ? dy : a.transform[4] - b.transform[4];
      });

    // Group items that share the same Y position into lines
    const lines = [];
    let curLine = [], lastY = null;
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
    pageTexts.push(lines.filter(Boolean).join('\n'));
  }

  return pageTexts.join('\n');
}
