// Regex-based PDF transaction parsers. Pure functions, no pdfjs dependency,
// importable from Node tests and the browser alike.

import { uid, categorize } from '../utils';

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// ── Helpers ────────────────────────────────────────────────────────────────────

function inferYear(text) {
  const m = text.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : new Date().getFullYear();
}

function inferPeriod(text) {
  const m = text.match(
    /(?:statement\s+period|period|from)[:\s]+([A-Za-z]+)\s+\d{1,2},?\s+(\d{4})\s*(?:to|-|–|—|through)\s*([A-Za-z]+)\s+\d{1,2},?\s+(\d{4})/i
  );
  if (!m) return null;
  const startMon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const endMon   = MONTHS[m[3].slice(0, 3).toLowerCase()];
  if (!startMon || !endMon) return null;
  return { startMonth: startMon, startYear: parseInt(m[2]), endYear: parseInt(m[4]) };
}

function yearForMonth(mon, period, fallbackYear) {
  if (period && period.startYear !== period.endYear) {
    return mon >= period.startMonth ? period.startYear : period.endYear;
  }
  return period ? period.startYear : fallbackYear;
}

function monthDayToISO(raw, year) {
  const m = raw.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  return `${year}-${String(mon).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
}

function slashDateToISO(raw) {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${year}-${m[1]}-${m[2]}`;
}

function parseAmt(str) {
  return parseFloat(str.replace(/[$,]/g, ''));
}

function mkTx(date, desc, amount, account) {
  return {
    id: uid(),
    date,
    description: desc.trim(),
    amount: parseFloat(amount.toFixed(2)),
    category: categorize(desc),
    account,
    source: 'pdf',
  };
}

const SKIP = /previous balance|credit limit|minimum payment|opening balance|closing balance|statement period|total (payment|credit|debit)|account summary|^\s*$/i;

// ── CIBC ───────────────────────────────────────────────────────────────────────

function parseCIBCCredit(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

  for (const line of lines) {
    if (SKIP.test(line)) continue;
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
    const amt     = parseAmt(m[3]);
    const isDebit = !m[4] || /dr/i.test(m[4]);
    if (!amt) continue;
    results.push(mkTx(date, m[2], isDebit ? -amt : amt, account));
  }
  return results;
}

// ── Scotiabank ─────────────────────────────────────────────────────────────────

// Scotiabank Credit Card — handles transactions concatenated on one line.
// Layout: <ref#> <txn-date> <post-date> <description> <amount>[<province>][-|CR]
function parseScotiaCredit(text, account) {
  const period   = inferPeriod(text);
  const fallback = inferYear(text);
  const MON      = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

  const headerRe = new RegExp(
    `\\b(\\d{1,4})\\s+(${MON})\\s+(\\d{1,2})\\s+${MON}\\s+\\d{1,2}\\s+`,
    'gi'
  );

  const headers = [];
  let h;
  while ((h = headerRe.exec(text)) !== null) {
    headers.push({
      start:  h.index,
      end:    h.index + h[0].length,
      monStr: h[2].slice(0, 3).toLowerCase(),
      day:    parseInt(h[3]),
    });
  }
  if (!headers.length) return [];

  const results = [];
  let lastMon = null, yearOffset = 0;

  for (let i = 0; i < headers.length; i++) {
    const hdr = headers[i];
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].start : text.length;
    const body = text.slice(hdr.end, bodyEnd).replace(/\s+/g, ' ').trim();

    const bm = body.match(/^(.+?)\s+\$?([\d,]+\.\d{2})([A-Z]{2})?\s*([-]|cr)?\s*$/i);
    if (!bm) continue;

    const mon = MONTHS[hdr.monStr];
    if (!mon) continue;

    if (lastMon !== null && mon < lastMon - 6) yearOffset++;
    lastMon = mon;
    const year = period ? yearForMonth(mon, period, fallback) : fallback + yearOffset;
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(hdr.day).padStart(2, '0')}`;

    let desc = bm[1].trim();
    if (bm[3]) desc = `${desc} ${bm[3]}`;
    const amt = parseAmt(bm[2]);
    if (!amt) continue;
    const isCredit = !!bm[4];

    results.push(mkTx(date, desc, isCredit ? amt : -amt, account));
  }
  return results;
}

function parseScotiaChequing(text, account) {
  const year  = inferYear(text);
  const lines = text.split('\n');
  const results = [];
  const MON = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const KW_DEPOSIT = /deposit|payroll|credit|refund|interest paid|e-?transfer.*receiv|pay.*receiv|govt|gst|cra/i;

  let prevBalance = null;

  for (const line of lines) {
    if (SKIP.test(line)) continue;
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
      signed = balance > prevBalance ? amt : -amt;
    } else {
      signed = KW_DEPOSIT.test(m[2]) ? amt : -amt;
    }
    results.push(mkTx(date, m[2], signed, account));
    prevBalance = balance;
  }
  return results;
}

// Amex Cobalt / Triangle World Elite Mastercard — same layout:
//   "Mar 29 Mar 31 MCDONALD'S #18461 WATERLOO 1.05"     (charge)
//   "Apr 18 Apr 18 PAYMENT RECEIVED - THANK YOU -2,632.33"  (payment, negative amount)
//   "Apr 12 Apr 13 PEARSON PARKING RESERVE TORONTO -168.55" (refund, negative amount)
// Two month-day dates, no ref#, no province codes, signed amount at the end.
// Negative amount in the source = credit/refund (becomes positive in our store);
// positive amount in the source = charge (becomes negative in our store).
function parseAmexOrTriangle(text, account) {
  const period   = inferPeriod(text);
  const fallback = inferYear(text);
  const MON      = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

  // Header = two month-day dates at the start of a line. Anchored to (^|\n)
  // so date-like substrings inside a description (rare) won't match.
  const headerRe = new RegExp(
    `(?:^|\\n)[ \\t]*(${MON})\\s+(\\d{1,2})\\s+${MON}\\s+\\d{1,2}\\s+`,
    'gi'
  );

  const headers = [];
  let h;
  while ((h = headerRe.exec(text)) !== null) {
    // h.index points at \n (or 0); advance past leading whitespace
    const skipLen = h[0].length - h[0].trimStart().length;
    headers.push({
      start:  h.index + skipLen,
      end:    h.index + h[0].length,
      monStr: h[1].slice(0, 3).toLowerCase(),
      day:    parseInt(h[2]),
    });
  }
  if (!headers.length) return [];

  const results = [];
  let lastMon = null, yearOffset = 0;

  for (let i = 0; i < headers.length; i++) {
    const hdr = headers[i];
    const bodyEnd = i + 1 < headers.length ? headers[i + 1].start : text.length;
    const body = text.slice(hdr.end, bodyEnd).replace(/\s+/g, ' ').trim();

    // Match the FIRST amount in the body — anything after (Reference numbers,
    // section totals, etc.) belongs to following lines, not this transaction.
    const bm = body.match(/^(.+?)\s+(-?\$?[\d,]+\.\d{2})(?:\s|$)/);
    if (!bm) continue;

    const mon = MONTHS[hdr.monStr];
    if (!mon) continue;

    if (lastMon !== null && mon < lastMon - 6) yearOffset++;
    lastMon = mon;
    const year = period ? yearForMonth(mon, period, fallback) : fallback + yearOffset;
    const date = `${year}-${String(mon).padStart(2, '0')}-${String(hdr.day).padStart(2, '0')}`;

    const desc = bm[1].trim();
    const raw  = parseFloat(bm[2].replace(/[$,]/g, ''));
    if (!raw) continue;

    // Source convention: positive = charge → negate. Negative = credit → flip to positive.
    const amount = -raw;

    results.push(mkTx(date, desc, amount, account));
  }
  return results;
}

// ── Public ─────────────────────────────────────────────────────────────────────

export const ACCOUNT_LABELS = {
  'cibc-chequing':   'CIBC Chequing',
  'cibc-credit':     'CIBC Credit Card',
  'scotia-chequing': 'Scotiabank Chequing',
  'scotia-credit':   'Scotiabank Credit Card',
  'amex':            'American Express',
  'canadian-tire':   'Canadian Tire Triangle',
};

export function parsePDFByBank(text, key) {
  const acc = ACCOUNT_LABELS[key] || key;
  if (key === 'cibc-credit')     return parseCIBCCredit(text, acc);
  if (key === 'cibc-chequing')   return parseCIBCChequing(text, acc);
  if (key === 'scotia-credit')   return parseScotiaCredit(text, acc);
  if (key === 'scotia-chequing') return parseScotiaChequing(text, acc);
  if (key === 'amex')            return parseAmexOrTriangle(text, acc);
  if (key === 'canadian-tire')   return parseAmexOrTriangle(text, acc);
  return [];
}
