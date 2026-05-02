import { uid, categorize, toDate } from '../utils';
import { ACCOUNT_LABELS } from '../constants';

function parseCSVRaw(text) {
  return text.trim().split(/\r?\n/).map(line => {
    const cols = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function mkTx(date, desc, amount, account) {
  return {
    id: uid(),
    date,
    description: desc.trim(),
    amount: parseFloat(amount.toFixed(2)),
    category: categorize(desc),
    account,
    source: 'csv',
  };
}

// CIBC Chequing & Credit: Date, Description, Debit, Credit
function parseCIBC(text, account) {
  return parseCSVRaw(text).flatMap(cols => {
    if (cols.length < 3) return [];
    const date = toDate(cols[0]);
    if (!date) return [];
    const debit  = parseFloat(cols[2]?.replace(/[$,]/g, '')) || 0;
    const credit = parseFloat(cols[3]?.replace(/[$,]/g, '')) || 0;
    const amount = credit > 0 ? credit : -debit;
    if (!amount) return [];
    return [mkTx(date, cols[1], amount, account)];
  });
}

// Scotiabank: Date, Description, Withdrawals, Deposits, Balance
function parseScotia(text, account) {
  return parseCSVRaw(text).flatMap(cols => {
    if (cols.length < 4) return [];
    const date = toDate(cols[0]);
    if (!date) return [];
    const wd = parseFloat(cols[2]?.replace(/[$,]/g, '')) || 0;
    const dp = parseFloat(cols[3]?.replace(/[$,]/g, '')) || 0;
    const amount = dp > 0 ? dp : -wd;
    if (!amount) return [];
    return [mkTx(date, cols[1], amount, account)];
  });
}

// Amex Canada: Date, Reference, Description, Amount (positive = charge)
function parseAmex(text, account) {
  return parseCSVRaw(text).flatMap(cols => {
    if (cols.length < 3) return [];
    const date = toDate(cols[0]);
    if (!date) return [];
    const desc = cols.length >= 4 ? cols[2] : cols[1];
    const raw  = parseFloat((cols.length >= 4 ? cols[3] : cols[2])?.replace(/[$,]/g, '')) || 0;
    if (!raw) return [];
    return [mkTx(date, desc, -raw, account)];
  });
}

// Canadian Tire Triangle: Date, Description, Amount (positive = charge)
function parseCT(text, account) {
  return parseCSVRaw(text).flatMap(cols => {
    if (cols.length < 3) return [];
    const date = toDate(cols[0]);
    if (!date) return [];
    const raw = parseFloat(cols[cols.length - 1]?.replace(/[$,]/g, '')) || 0;
    if (!raw) return [];
    return [mkTx(date, cols[1], -raw, account)];
  });
}

export function parseByBank(text, key) {
  const acc = ACCOUNT_LABELS[key] || key;
  if (key === 'cibc-chequing' || key === 'cibc-credit')     return parseCIBC(text, acc);
  if (key === 'scotia-chequing' || key === 'scotia-credit') return parseScotia(text, acc);
  if (key === 'amex')          return parseAmex(text, acc);
  if (key === 'canadian-tire') return parseCT(text, acc);
  return [];
}
