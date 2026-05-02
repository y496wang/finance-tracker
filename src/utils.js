import { RULES } from './constants';

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const cad = n =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

export const nowMonth = () => new Date().toISOString().slice(0, 7);

export function categorize(desc) {
  for (const r of RULES) if (r.re.test(desc)) return r.cat;
  return 'Other';
}

export function toDate(raw) {
  if (!raw) return '';
  raw = raw.replace(/"/g, '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}

export function isDupe(t, transactions) {
  return transactions.some(
    x => x.date === t.date && x.amount === t.amount && x.description === t.description
  );
}
