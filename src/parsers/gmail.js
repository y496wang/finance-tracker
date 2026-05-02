import { uid, categorize } from '../utils';
import { BANK_QUERIES } from '../constants';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function b64decode(data) {
  return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
}

function extractBody(payload) {
  function scan(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) return b64decode(part.body.data);
    if (part.parts) for (const p of part.parts) { const r = scan(p); if (r) return r; }
    return null;
  }
  return scan(payload) || '';
}

function parseEmailBody(body, from) {
  const amtMatch = body.match(/\$\s*([\d,]+\.?\d*)/);
  if (!amtMatch) return null;
  const amount = -parseFloat(amtMatch[1].replace(/,/g, ''));
  if (!amount) return null;

  let description = 'Bank Transaction';
  for (const p of [
    /(?:merchant|store|location|purchase at)[:\s]+([^\n\r$<]+)/i,
    /(?:description)[:\s]+([^\n\r$<]+)/i,
  ]) {
    const m = body.match(p);
    if (m) { description = m[1].trim().replace(/\s+/g, ' ').slice(0, 60); break; }
  }

  let date = new Date().toISOString().slice(0, 10);
  for (const p of [
    /(?:date|on)[:\s]+(\w+ \d{1,2},? \d{4})/i,
    /(?:date|on)[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(?:date|on)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]) {
    const m = body.match(p);
    if (m) { const d = new Date(m[1]); if (!isNaN(d)) { date = d.toISOString().slice(0, 10); break; } }
  }

  let account = 'Unknown';
  if (/cibc/i.test(from))
    account = /chequing|checking/i.test(body) ? 'CIBC Chequing' : 'CIBC Credit Card';
  else if (/scotiabank/i.test(from))
    account = /chequing|checking/i.test(body) ? 'Scotiabank Chequing' : 'Scotiabank Credit Card';
  else if (/americanexpress/i.test(from))
    account = 'American Express';
  else if (/canadiantire|triangle/i.test(from))
    account = 'Canadian Tire Triangle';

  return { id: uid(), date, description, amount, category: categorize(description), account, source: 'gmail' };
}

async function gFetch(path, params, accessToken) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${GMAIL_API}${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Gmail API ${r.status}: ${r.statusText}`);
  return r.json();
}

export async function scanGmail({ accessToken, fromDate, onProgress, transactions }) {
  const found = [];
  let scanned = 0;

  for (const { label, q } of BANK_QUERIES) {
    onProgress(`Searching ${label}…`);
    let query = q;
    if (fromDate) query += ` after:${fromDate.replace(/-/g, '/')}`;
    let pageToken = null;

    do {
      const params = { q: query, maxResults: 100 };
      if (pageToken) params.pageToken = pageToken;
      const list = await gFetch('/messages', params, accessToken);
      if (!list.messages?.length) break;

      for (const msg of list.messages) {
        scanned++;
        onProgress(`Scanned ${scanned} emails — ${found.length} transaction${found.length !== 1 ? 's' : ''} found…`);
        const detail = await gFetch(`/messages/${msg.id}`, { format: 'full' }, accessToken);
        const from = detail.payload.headers?.find(h => h.name === 'From')?.value || '';
        const body = extractBody(detail.payload);
        const tx = parseEmailBody(body, from);
        if (tx && !transactions.some(x => x.date === tx.date && x.amount === tx.amount && x.description === tx.description)) {
          found.push(tx);
        }
      }
      pageToken = list.nextPageToken || null;
    } while (pageToken);
  }

  return { found, scanned };
}

export function initOAuth(clientId, onSuccess, onError) {
  if (!clientId || typeof google === 'undefined') return null;
  try {
    return google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: r => {
        if (r.error) { onError(r.error); return; }
        onSuccess(r.access_token);
      },
    });
  } catch (e) {
    onError(e.message);
    return null;
  }
}
