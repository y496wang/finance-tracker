import { useState, useRef } from 'react';
import useStore from '../../store';
import { parseByBank } from '../../parsers/csv';
import { scanGmail, DRIVE_SCOPE, initOAuth } from '../../parsers/gmail';
import { extractPDFText, parsePDFByBank } from '../../parsers/pdf';
import { cad } from '../../utils';

const BANK_OPTIONS = [
  { value: 'cibc-chequing',   label: 'CIBC Chequing' },
  { value: 'cibc-credit',     label: 'CIBC Credit Card' },
  { value: 'scotia-chequing', label: 'Scotiabank Chequing' },
  { value: 'scotia-credit',   label: 'Scotiabank Credit Card' },
  { value: 'amex',            label: 'American Express' },
  { value: 'canadian-tire',   label: 'Canadian Tire Triangle' },
];

const ACCOUNT_LABELS = {
  'cibc-chequing':   'CIBC Chequing',
  'cibc-credit':     'CIBC Credit Card',
  'scotia-chequing': 'Scotiabank Chequing',
  'scotia-credit':   'Scotiabank Credit Card',
  'amex':            'American Express',
  'canadian-tire':   'Canadian Tire Triangle',
};

function PreviewPanel({ preview, onConfirm, onCancel }) {
  if (!preview) return null;
  return (
    <div className="mt-4">
      <div className="text-green mb-2">
        ✓ Found {preview.unique.length} new transaction{preview.unique.length !== 1 ? 's' : ''} ({preview.all.length} total)
      </div>
      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', marginBottom: '12px' }}>
        {preview.unique.slice(0, 20).map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid #ffffff09' }}>
            <span>{t.date} — {t.description.slice(0, 40)}</span>
            <span className={t.amount < 0 ? 'text-red' : 'text-green'} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>{cad(t.amount)}</span>
          </div>
        ))}
        {preview.unique.length > 20 && <div className="text-muted text-sm" style={{ padding: '4px 0' }}>…and {preview.unique.length - 20} more</div>}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={onConfirm} disabled={preview.unique.length === 0}>
          Import {preview.unique.length} transaction{preview.unique.length !== 1 ? 's' : ''}
        </button>
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Import() {
  const transactions    = useStore(s => s.transactions);
  const accessToken     = useStore(s => s.accessToken);
  const driveToken      = useStore(s => s.driveToken);
  const clientId        = useStore(s => s.clientId);
  const setDriveToken   = useStore(s => s.setDriveToken);
  const addTransactions = useStore(s => s.addTransactions);
  const showToast       = useStore(s => s.showToast);

  const [bankKey,    setBankKey]    = useState('cibc-chequing');
  const [csvPreview, setCsvPreview] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfStatus,  setPdfStatus]  = useState('');
  const [pdfDebug,   setPdfDebug]   = useState('');         // last extracted text
  const [showDebug,  setShowDebug]  = useState(false);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [isDragging, setDragging]   = useState(false);
  const [isPdfDrag,  setPdfDrag]    = useState(false);

  const [fromDate,   setFromDate]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [scanning,   setScanning]   = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const csvFileRef = useRef();
  const pdfFileRef = useRef();

  // ── Dedup ─────────────────────────────────────────────────────────────────
  function makePreview(all) {
    const unique = all.filter(t => !transactions.some(x => x.date === t.date && x.amount === t.amount && x.description === t.description));
    return { all, unique };
  }

  function confirmImport(preview, clearFn) {
    const added = addTransactions(preview.unique);
    showToast(`Imported ${added} transaction${added !== 1 ? 's' : ''}`);
    clearFn(null);
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  function processCSVText(text) {
    try {
      setCsvPreview(makePreview(parseByBank(text, bankKey)));
    } catch (e) {
      showToast('CSV parse error: ' + e.message, 'err');
    }
  }

  function handleCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => processCSVText(e.target.result);
    reader.readAsText(file);
  }

  // ── PDF parsing (multi-file) ──────────────────────────────────────────────
  async function processPDFFiles(files) {
    if (!files.length) return;
    setPdfProcessing(true);
    setPdfStatus('');
    setPdfPreview(null);
    setShowDebug(false);

    const all = [];
    const debugChunks = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setPdfStatus(`Processing "${file.name}" (${i + 1} / ${files.length})…`);
        const text = await extractPDFText(file);
        debugChunks.push(`══════ ${file.name} ══════\n${text}`);
        const parsed = parsePDFByBank(text, bankKey);
        all.push(...parsed);
      }

      setPdfDebug(debugChunks.join('\n\n'));

      if (!all.length) {
        setPdfStatus(`⚠ No transactions found in ${files.length > 1 ? 'any of the' : 'the'} PDF${files.length > 1 ? 's' : ''}. Open the extracted text below to see what was parsed — the regex may need tweaking for your statement format.`);
        return;
      }

      setPdfStatus(`✓ Extracted ${all.length} transaction${all.length !== 1 ? 's' : ''} from ${files.length} file${files.length !== 1 ? 's' : ''}.`);
      setPdfPreview(makePreview(all));
    } catch (e) {
      setPdfStatus(`Error: ${e.message}`);
      showToast('PDF processing failed: ' + e.message, 'err');
    } finally {
      setPdfProcessing(false);
    }
  }

  // ── Google Drive ───────────────────────────────────────────────────────────
  async function getDriveToken() {
    if (driveToken) return driveToken;
    if (!clientId) throw new Error('Add your OAuth Client ID in Settings first');
    return new Promise((resolve, reject) => {
      const client = initOAuth(
        clientId,
        token => { setDriveToken(token); resolve(token); },
        err   => reject(new Error(err)),
        DRIVE_SCOPE,
      );
      if (!client) { reject(new Error('Could not init Google OAuth')); return; }
      client.requestAccessToken();
    });
  }

  async function openDrivePicker() {
    try {
      const token = await getDriveToken();
      await new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined') { reject(new Error('Google API script not loaded — try again in a moment')); return; }
        gapi.load('picker', { callback: resolve, onerror: reject });
      });

      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setMode(google.picker.DocsViewMode.LIST);

      new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setCallback(async data => {
          if (data[google.picker.Response.ACTION] !== google.picker.Action.PICKED) return;
          const docs = data[google.picker.Response.DOCUMENTS];
          setPdfStatus(`Downloading ${docs.length} file${docs.length !== 1 ? 's' : ''} from Drive…`);
          setPdfPreview(null);
          try {
            const blobs = await Promise.all(docs.map(async doc => {
              const res = await fetch(
                `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (!res.ok) throw new Error(`Drive API ${res.status} for "${doc.name}"`);
              const buf = await res.arrayBuffer();
              return new File([buf], doc.name, { type: 'application/pdf' });
            }));
            await processPDFFiles(blobs);
          } catch (e) {
            setPdfStatus('Drive error: ' + e.message);
            showToast('Drive download failed: ' + e.message, 'err');
          }
        })
        .build()
        .setVisible(true);
    } catch (e) {
      showToast(e.message, 'err');
    }
  }

  // ── Gmail scan ─────────────────────────────────────────────────────────────
  async function handleScan() {
    if (!accessToken) { showToast('Connect Gmail first', 'err'); return; }
    setScanning(true); setScanStatus('Starting…');
    try {
      const { found, scanned } = await scanGmail({ accessToken, fromDate, onProgress: setScanStatus, transactions });
      const added = addTransactions(found);
      setScanStatus(`✓ Scanned ${scanned} emails — added ${added} new transaction${added !== 1 ? 's' : ''}.`);
      showToast(`Added ${added} transaction${added !== 1 ? 's' : ''} from Gmail`);
    } catch (e) {
      setScanStatus('Error: ' + e.message);
      showToast('Gmail scan failed: ' + e.message, 'err');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div>
      <h2 className="section-title mb-4">Import Transactions</h2>

      {/* ── Row 1: CSV + Gmail ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }} className="grid-2">

        {/* CSV */}
        <div className="card">
          <div className="card-title">📂 CSV Import</div>
          <p className="text-muted mb-4">Download your transaction history CSV from online banking.</p>

          <div className="form-row">
            <label className="field-label">Bank / Account</label>
            <select className="w-full" value={bankKey} onChange={e => { setBankKey(e.target.value); setCsvPreview(null); setPdfPreview(null); }}>
              {BANK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div
            className={`drop-zone${isDragging ? ' drag' : ''}`}
            onClick={() => csvFileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleCsvFile(e.dataTransfer.files[0]); }}
          >
            <div className="drop-icon">📄</div>
            <div>Drop CSV here or click to browse</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>Supports CIBC · Scotiabank · Amex · CT Triangle</div>
            <input ref={csvFileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { handleCsvFile(e.target.files[0]); e.target.value = ''; }} />
          </div>

          <PreviewPanel preview={csvPreview} onConfirm={() => confirmImport(csvPreview, setCsvPreview)} onCancel={() => setCsvPreview(null)} />
        </div>

        {/* Gmail */}
        <div className="card">
          <div className="card-title">📧 Gmail Scan</div>
          <p className="text-muted mb-4">Scan your inbox for transaction alerts from CIBC, Scotiabank, Amex, and Canadian Tire.</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'var(--surface2)', borderRadius: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '22px' }}>{accessToken ? '✅' : '📬'}</span>
            <div>
              <div style={{ fontWeight: 500 }}>{accessToken ? 'Gmail connected' : 'Not connected'}</div>
              <div className="text-muted text-sm">{accessToken ? 'Ready to scan inbox' : 'Connect via the header button'}</div>
            </div>
          </div>

          <div className="form-row">
            <label className="field-label">Scan emails from date</label>
            <input type="date" className="w-full" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>

          <button className="btn btn-primary w-full" onClick={handleScan} disabled={!accessToken || scanning}>
            {scanning ? <><span className="spin" /> Scanning…</> : 'Scan Inbox'}
          </button>

          {scanStatus && (
            <div className={`mt-4 text-sm ${scanStatus.startsWith('✓') ? 'text-green' : scanStatus.startsWith('Error') ? 'text-red' : 'text-muted'}`}>
              {scanStatus}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: PDF (full width) ── */}
      <div className="card">
        <div className="flex between center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div className="card-title" style={{ marginBottom: '2px' }}>📑 PDF e-Statement Import</div>
            <div className="text-muted text-sm">Drop one or multiple PDFs at once · uses bank selected above</div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'right' }}>
            Selected bank: <strong style={{ color: 'var(--text)' }}>{BANK_OPTIONS.find(o => o.value === bankKey)?.label}</strong>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2">
          {/* Local PDF — multiple files */}
          <div
            className={`drop-zone${isPdfDrag ? ' drag' : ''}`}
            onClick={() => !pdfProcessing && pdfFileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
            onDragLeave={() => setPdfDrag(false)}
            onDrop={e => {
              e.preventDefault(); setPdfDrag(false);
              const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
              if (files.length) processPDFFiles(files);
            }}
            style={{ cursor: pdfProcessing ? 'not-allowed' : 'pointer', opacity: pdfProcessing ? 0.6 : 1 }}
          >
            <div className="drop-icon">{pdfProcessing ? <span className="spin" style={{ width: '32px', height: '32px', borderWidth: '3px' }} /> : '📑'}</div>
            <div style={{ fontWeight: 500 }}>Upload PDF{pdfProcessing ? ' — processing…' : 's'} from device</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>
              {pdfProcessing ? 'Please wait…' : 'Drop one or multiple .pdf files · or click to browse'}
            </div>
            <input ref={pdfFileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
              onChange={e => { processPDFFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          </div>

          {/* Google Drive — multiple files via picker */}
          <div
            style={{
              border: '2px dashed var(--border)', borderRadius: '12px', padding: '36px',
              textAlign: 'center', cursor: pdfProcessing ? 'not-allowed' : 'pointer',
              opacity: pdfProcessing ? 0.6 : 1, transition: 'border-color .15s',
            }}
            onClick={!pdfProcessing ? openDrivePicker : undefined}
            onMouseEnter={e => { if (!pdfProcessing) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div className="drop-icon">
              <svg width="40" height="34" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.6 66.85L13.57 78h60.15l13.57-23.5H73.73L60.16 78H27.14L6.6 66.85z" fill="#0066DA"/>
                <path d="M43.65 0L22.35 38.03l13.57 23.5L57.22 23.5 43.65 0z" fill="#00AC47"/>
                <path d="M0 54.5L13.57 78 27.14 54.5 13.57 31 0 54.5z" fill="#EA4335"/>
                <path d="M57.22 23.5L43.65 0 87.3 0 73.73 23.5 57.22 23.5z" fill="#00832D"/>
                <path d="M73.73 23.5L87.3 0 87.3 78 73.73 54.5 73.73 23.5z" fill="#2684FC"/>
                <path d="M0 54.5L27.14 54.5 40.71 78 13.57 78 0 54.5z" fill="#FFBA00"/>
              </svg>
            </div>
            <div style={{ fontWeight: 500 }}>Pick PDFs from Google Drive</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>
              {driveToken ? 'Drive connected — select one or multiple PDFs' : 'Will prompt for Drive access · select multiple files'}
            </div>
          </div>
        </div>

        {pdfStatus && (
          <div
            className={`mt-4 text-sm ${pdfStatus.startsWith('⚠') ? '' : pdfStatus.startsWith('Error') ? 'text-red' : pdfStatus.startsWith('✓') ? 'text-green' : 'text-muted'}`}
            style={pdfStatus.startsWith('⚠') ? { color: 'var(--yellow)' } : {}}
          >
            {pdfStatus}
          </div>
        )}

        {pdfDebug && (
          <div className="mt-4">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowDebug(!showDebug)}
            >
              {showDebug ? '▾ Hide extracted text' : '▸ Show extracted text (debug)'}
            </button>
            {showDebug && (
              <textarea
                readOnly
                value={pdfDebug}
                style={{
                  width: '100%', minHeight: '300px', marginTop: '8px',
                  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                  fontSize: '11px', lineHeight: 1.5, whiteSpace: 'pre',
                  background: 'var(--surface2)', color: 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: '8px', padding: '12px',
                  resize: 'vertical',
                }}
              />
            )}
          </div>
        )}

        <PreviewPanel
          preview={pdfPreview}
          onConfirm={() => confirmImport(pdfPreview, setPdfPreview)}
          onCancel={() => setPdfPreview(null)}
        />
      </div>
    </div>
  );
}
