import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { uid, categorize } from '../utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// ── Text extraction ────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function inferYear(text) {
  const m = text.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

function monthDayToISO(raw, year) {
  const m = raw.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0,3).toLowerCase()];
  return `${year}-${String(mon).padStart(2,'0')}-${String(parseInt(m[2])).padStart(2,'0')}`;
}

function slashDateToISO(raw) {
  // MM/DD/YY or MM/DD/YYYY
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${year}-${m[1]}-${m[2]}`;
}

function parseAmt(str) {
  return parseFloat(str.replace(/[$,]/g, ''));
}

function mkTx(date, desc, amount, account) {
  return { id: uid(), date, description: desc.trim(), amount: parseFloat(amount.toFixed(2)), category: categorize(desc), account, source: 'pdf' };
}

const SKIP = /previous balance|credit limit|minimum payment|opening balance|closing balance|statement period|total (payment|credit|debit)|account summary|^\s*$/i;

// ── Bank parsers ───────────────────────────────────────────────────────────────

// CIBC Credit Card: "Jan 15 Jan 17 MERCHANT NAME 123.45"  or  "Jan 15 MERCHANT 123.45 CR"
function parseCIBCCredit(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  for (const line of lines) {
    if (SKIP.test(line)) continue;
    // Two date columns (transaction date + posting date) then description + amount
    const m = line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2})\\s+(?:${MON})[a-z]*\\.?\\s+\\d{1,2}\\s+(.+?)\\s+([\\d,]+\\.\\d{2})\\s*(cr)?$`, 'i')
    ) || line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2})\\s+(.+?)\\s+([\\d,]+\\.\\d{2})\\s*(cr)?$`, 'i')
    );
    if (!m) continue;
    const date = monthDayToISO(m[1], year);
    if (!date) continue;
    const amt    = parseAmt(m[3]);
    const credit = !!m[4];
    if (!amt) continue;
    results.push(mkTx(date, m[2], credit ? amt : -amt, account));
  }
  return results;
}

// CIBC Chequing: "Jan 15 2024 MERCHANT 123.45 DR" / "123.45 CR"
function parseCIBCChequing(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  for (const line of lines) {
    if (SKIP.test(line)) continue;
    const m = line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2})(?:\\s+\\d{4})?\\s+(.+?)\\s+([\\d,]+\\.\\d{2})\\s*(cr|dr)?$`, 'i')
    );
    if (!m) continue;
    const date = monthDayToISO(m[1], year);
    if (!date) continue;
    const amt    = parseAmt(m[3]);
    const isDebit = !m[4] || /dr/i.test(m[4]);
    if (!amt) continue;
    results.push(mkTx(date, m[2], isDebit ? -amt : amt, account));
  }
  return results;
}

// Scotiabank Credit:
//   "Mar 15  Mar 16  MERCHANT NAME  12.45"          (two date columns — transaction + posting)
//   "Mar 15  Mar 16  PAYMENT - MERCI  500.00-"      (trailing minus = credit)
//   "Mar 15  MERCHANT  12.45 CR"                    (single date — older statements)
//   "03/15/24  MERCHANT  12.45-"                    (slash dates)
function parseScotiaCredit(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  for (const line of lines) {
    if (SKIP.test(line)) continue;

    // Two-date columns (most common Scotiabank layout)
    let m = line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2})\\s+(?:${MON})[a-z]*\\.?\\s+\\d{1,2}\\s+(.+?)\\s+\\$?([\\d,]+\\.\\d{2})\\s*([-]|cr)?\\s*$`, 'i')
    );

    // Single date with month name
    if (!m) m = line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{4})?)\\s+(.+?)\\s+\\$?([\\d,]+\\.\\d{2})\\s*([-]|cr)?\\s*$`, 'i')
    );

    // Slash date
    if (!m) m = line.match(/^(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+\$?([\d,]+\.\d{2})\s*([-]|cr)?\s*$/i);

    if (!m) continue;

    const date = m[1].includes('/') ? slashDateToISO(m[1]) : monthDayToISO(m[1], year);
    if (!date) continue;
    const amt = parseAmt(m[3]);
    if (!amt) continue;
    const isCredit = !!m[4]; // trailing `-` or `CR` = credit/payment to card
    results.push(mkTx(date, m[2], isCredit ? amt : -amt, account));
  }
  return results;
}

// Scotiabank Chequing — uses balance delta to infer sign, falls back to keywords
//   "Mar 15  TIM HORTONS         12.45            1,234.56"   (withdrawal)
//   "Mar 16  PAYROLL                    3,000.00  4,234.56"   (deposit)
// PDF text extraction collapses empty columns, so both look like:
//   "Mar 15 TIM HORTONS 12.45 1,234.56"
// We track the running balance across lines; if balance went up it's a deposit.
function parseScotiaChequing(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const KW_DEPOSIT = /deposit|payroll|credit|refund|interest paid|e-?transfer.*receiv|pay.*receiv|govt|gst|cra/i;

  let prevBalance = null;

  for (const line of lines) {
    if (SKIP.test(line)) continue;

    // <date> <description> <amount> <balance>
    const m = line.match(
      new RegExp(`^((?:${MON})[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{4})?)\\s+(.+?)\\s+\\$?([\\d,]+\\.\\d{2})\\s+\\$?([\\d,]+\\.\\d{2})\\s*$`, 'i')
    );
    if (!m) continue;

    const date = monthDayToISO(m[1], year);
    if (!date) continue;
    const amt     = parseAmt(m[3]);
    const balance = parseAmt(m[4]);
    if (!amt) continue;

    let signed;
    if (prevBalance !== null) {
      // Balance delta is the most reliable signal
      signed = balance > prevBalance ? amt : -amt;
    } else {
      // First row — fall back to keyword detection
      signed = KW_DEPOSIT.test(m[2]) ? amt : -amt;
    }

    results.push(mkTx(date, m[2], signed, account));
    prevBalance = balance;
  }
  return results;
}

// Amex: "01/15/24 MERCHANT $123.45" or with ref: "01/15/24 123456 MERCHANT $123.45"
function parseAmex(text, account) {
  const lines = text.split('\n');
  const results = [];

  for (const line of lines) {
    if (SKIP.test(line)) continue;
    // Optional reference number between date and description
    const m = line.match(/^(\d{2}\/\d{2}\/\d{2,4})\s+(?:\d{5,}\s+)?(.+?)\s+\$?([\d,]+\.\d{2})\s*(cr)?$/i);
    if (!m) continue;
    const date = slashDateToISO(m[1]);
    if (!date) continue;
    const amt = parseAmt(m[3]);
    if (!amt) continue;
    // Amex: positive = charge (expense), CR = credit/payment
    results.push(mkTx(date, m[2], m[4] ? amt : -amt, account));
  }
  return results;
}

// Canadian Tire Triangle: similar to Amex
function parseCT(text, account) {
  return parseAmex(text, account).map(t => ({ ...t, account }));
}

// ── Main export ────────────────────────────────────────────────────────────────

export function parsePDFByBank(text, key) {
  const ACCOUNT_LABELS = {
    'cibc-chequing':   'CIBC Chequing',
    'cibc-credit':     'CIBC Credit Card',
    'scotia-chequing': 'Scotiabank Chequing',
    'scotia-credit':   'Scotiabank Credit Card',
    'amex':            'American Express',
    'canadian-tire':   'Canadian Tire Triangle',
  };
  const acc = ACCOUNT_LABELS[key] || key;
  if (key === 'cibc-credit')     return parseCIBCCredit(text, acc);
  if (key === 'cibc-chequing')   return parseCIBCChequing(text, acc);
  if (key === 'scotia-credit')   return parseScotiaCredit(text, acc);
  if (key === 'scotia-chequing') return parseScotiaChequing(text, acc);
  if (key === 'amex')            return parseAmex(text, acc);
  if (key === 'canadian-tire')   return parseCT(text, acc);
  return [];
}
