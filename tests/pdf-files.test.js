// Real-PDF integration tests.
// Reads every PDF from ~/Desktop/finance-tracker-sample-files/, extracts the
// text via PDF.js, runs it through the bank-specific parser, and asserts
// transactions were found. Skipped automatically in CI (folder not present).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Use the legacy build so PDF.js runs in Node without DOM
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');

import { parsePDFByBank } from '../src/parsers/pdfParse.js';

const SAMPLE_DIR = path.join(os.homedir(), 'Desktop', 'finance-tracker-sample-files');
const FOLDER_EXISTS = fs.existsSync(SAMPLE_DIR);

// Map a filename to a bank key. Adjust as new sample files are added.
function bankKeyFor(filename) {
  const f = filename.toLowerCase();
  if (f.includes('scotiabank') && f.includes('chequing')) return 'scotia-chequing';
  if (f.includes('scotiabank'))                            return 'scotia-credit';
  if (f.includes('amex') || f.includes('amx'))             return 'amex';
  if (f.includes('triangle') || f.includes('canadiantire')) return 'canadian-tire';
  if (f.includes('cibc') && f.includes('chequing'))        return 'cibc-chequing';
  if (f.includes('cibc'))                                  return 'cibc-credit';
  return null;
}

async function extractText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({ data, disableWorker: true, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Mirror the production extraction in src/parsers/pdf.js — sort top-to-bottom,
    // left-to-right, then group items that share the same Y into lines.
    const items = content.items
      .filter(i => i.str?.trim())
      .sort((a, b) => {
        const dy = b.transform[5] - a.transform[5];
        return Math.abs(dy) > 4 ? dy : a.transform[4] - b.transform[4];
      });

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

describe.skipIf(!FOLDER_EXISTS)('PDF parser — real sample files', () => {
  const files = FOLDER_EXISTS
    ? fs.readdirSync(SAMPLE_DIR).filter(f => f.toLowerCase().endsWith('.pdf'))
    : [];

  if (!files.length) {
    it.skip('no PDFs in sample folder', () => {});
    return;
  }

  for (const file of files) {
    const bankKey = bankKeyFor(file);
    if (!bankKey) {
      it.skip(`${file} (no bank mapping)`, () => {});
      continue;
    }

    it(`extracts transactions from ${file} as ${bankKey}`, async () => {
      const filePath = path.join(SAMPLE_DIR, file);
      const text = await extractText(filePath);
      const txs = parsePDFByBank(text, bankKey);

      // Surface useful info on failure
      if (txs.length === 0) {
        console.error(`\n──── ${file} extracted text (first 2 KB) ────`);
        console.error(text.slice(0, 2000));
        console.error('────────────────────────────────────────────────');
      }

      expect(txs.length, `expected at least 1 transaction from ${file}`).toBeGreaterThan(0);

      // Sanity-check the shape of every transaction
      for (const t of txs) {
        expect(t.date, 'date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof t.amount, 'amount type').toBe('number');
        expect(t.amount, 'amount').not.toBe(0);
        expect(t.description, 'description').toBeTruthy();
        expect(t.account, 'account').toBeTruthy();
      }

      console.log(`  ✓ ${file} → ${txs.length} transactions (${bankKey})`);
    });
  }
});
