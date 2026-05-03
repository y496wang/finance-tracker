import { useState, useRef } from 'react';
import useStore from '../../store';
import { parseByBank } from '../../parsers/csv';
import { scanGmail } from '../../parsers/gmail';
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

function PreviewPanel({ preview, onConfirm, onCancel }) {
  if (!preview) return null;
  return (
    <div className="mt-4">
      <div className="text-green mb-2">
        ✓ Found {preview.unique.length} new transaction{preview.unique.length !== 1 ? 's' : ''} ({preview.all.length} total in file)
      </div>
      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', marginBottom: '12px' }}>
        {preview.unique.slice(0, 15).map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid #ffffff09' }}>
            <span>{t.date} — {t.description.slice(0, 38)}</span>
            <span className={t.amount < 0 ? 'text-red' : 'text-green'} style={{ marginLeft: '12px', whiteSpace: 'nowrap' }}>{cad(t.amount)}</span>
          </div>
        ))}
        {preview.unique.length > 15 && <div className="text-muted text-sm" style={{ padding: '4px 0' }}>…and {preview.unique.length - 15} more</div>}
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
  const addTransactions = useStore(s => s.addTransactions);
  const showToast       = useStore(s => s.showToast);

  const [bankKey,    setBankKey]    = useState('cibc-chequing');
  const [csvPreview, setCsvPreview] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [pdfStatus,  setPdfStatus]  = useState('');
  const [isDragging, setDragging]   = useState(false);
  const [isPdfDrag,  setPdfDrag]    = useState(false);

  const [fromDate,   setFromDate]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [scanning,   setScanning]   = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const csvFileRef = useRef();
  const pdfFileRef = useRef();

  // ── Dedup helper ──────────────────────────────────────────────────────────
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

  // ── PDF (local) ───────────────────────────────────────────────────────────
  async function processPDFFile(file) {
    setPdfStatus('Extracting text from PDF…');
    setPdfPreview(null);
    try {
      const text   = await extractPDFText(file);
      const parsed = parsePDFByBank(text, bankKey);
      if (!parsed.length) {
        setPdfStatus('⚠ No transactions found. Make sure the correct bank is selected and the PDF is a text-based statement (not a scan).');
        return;
      }
      setPdfStatus('');
      setPdfPreview(makePreview(parsed));
    } catch (e) {
      setPdfStatus('PDF error: ' + e.message);
    }
  }

  // ── Google Drive Picker ────────────────────────────────────────────────────
  async function openDrivePicker() {
    if (!accessToken) { showToast('Connect Gmail/Drive first', 'err'); return; }

    // Load the Picker API via gapi
    await new Promise((resolve, reject) => {
      if (typeof gapi === 'undefined') { reject(new Error('Google API not loaded')); return; }
      gapi.load('picker', { callback: resolve, onerror: reject });
    });

    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setMimeTypes('application/pdf')
      .setMode(google.picker.DocsViewMode.LIST);

    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setCallback(async data => {
        if (data[google.picker.Response.ACTION] !== google.picker.Action.PICKED) return;
        const file = data[google.picker.Response.DOCUMENTS][0];
        setPdfStatus(`Downloading "${file.name}" from Drive…`);
        setPdfPreview(null);
        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!res.ok) throw new Error(`Drive API ${res.status}`);
          const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
          await processPDFFile(blob);
        } catch (e) {
          setPdfStatus('Drive error: ' + e.message);
          showToast('Drive download failed: ' + e.message, 'err');
        }
      })
      .build()
      .setVisible(true);
  }

  // ── Gmail scan ────────────────────────────────────────────────────────────
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
              <div style={{ fontWeight: 500 }}>{accessToken ? 'Gmail & Drive connected' : 'Not connected'}</div>
              <div className="text-muted text-sm">{accessToken ? 'Ready to scan inbox and Drive' : 'Connect via the header button'}</div>
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
        <div className="card-title">📑 PDF e-Statement Import</div>
        <p className="text-muted mb-4">
          Import a bank e-statement PDF — upload from your device or pick directly from Google Drive.
          Make sure the correct bank is selected above.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2">
          {/* Local PDF */}
          <div
            className={`drop-zone${isPdfDrag ? ' drag' : ''}`}
            onClick={() => pdfFileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setPdfDrag(true); }}
            onDragLeave={() => setPdfDrag(false)}
            onDrop={e => { e.preventDefault(); setPdfDrag(false); processPDFFile(e.dataTransfer.files[0]); }}
          >
            <div className="drop-icon">📑</div>
            <div style={{ fontWeight: 500 }}>Upload PDF from device</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>Drop here or click to browse · .pdf files only</div>
            <input ref={pdfFileRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => { processPDFFile(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {/* Google Drive */}
          <div
            style={{
              border: '2px dashed var(--border)', borderRadius: '12px', padding: '36px',
              textAlign: 'center', cursor: accessToken ? 'pointer' : 'not-allowed',
              opacity: accessToken ? 1 : 0.5, transition: 'border-color .15s',
            }}
            onClick={accessToken ? openDrivePicker : undefined}
            onMouseEnter={e => { if (accessToken) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div className="drop-icon">
              <svg width="40" height="40" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.6 66.85L13.57 78h60.15l13.57-23.5H73.73L60.16 78H27.14L6.6 66.85z" fill="#0066DA"/>
                <path d="M43.65 0L22.35 38.03l13.57 23.5L57.22 23.5 43.65 0z" fill="#00AC47"/>
                <path d="M0 54.5L13.57 78 27.14 54.5 13.57 31 0 54.5z" fill="#EA4335"/>
                <path d="M57.22 23.5L43.65 0 87.3 0 73.73 23.5 57.22 23.5z" fill="#00832D"/>
                <path d="M73.73 23.5L87.3 0 87.3 78 73.73 54.5 73.73 23.5z" fill="#2684FC"/>
                <path d="M0 54.5L27.14 54.5 40.71 78 13.57 78 0 54.5z" fill="#FFBA00"/>
              </svg>
            </div>
            <div style={{ fontWeight: 500 }}>Pick PDF from Google Drive</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>
              {accessToken ? 'Opens Google Drive file picker' : 'Connect Gmail/Drive first'}
            </div>
          </div>
        </div>

        {pdfStatus && (
          <div className={`mt-4 text-sm ${pdfStatus.startsWith('⚠') ? '' : pdfStatus.startsWith('PDF error') || pdfStatus.startsWith('Drive error') ? 'text-red' : 'text-muted'}`}
            style={pdfStatus.startsWith('⚠') ? { color: 'var(--yellow)' } : {}}>
            {pdfStatus}
          </div>
        )}

        <PreviewPanel preview={pdfPreview} onConfirm={() => confirmImport(pdfPreview, setPdfPreview)} onCancel={() => setPdfPreview(null)} />
      </div>
    </div>
  );
}
