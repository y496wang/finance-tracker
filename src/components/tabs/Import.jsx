import { useState, useRef } from 'react';
import useStore from '../../store';
import { parseByBank } from '../../parsers/csv';
import { scanGmail } from '../../parsers/gmail';
import { cad } from '../../utils';

const BANK_OPTIONS = [
  { value: 'cibc-chequing',   label: 'CIBC Chequing' },
  { value: 'cibc-credit',     label: 'CIBC Credit Card' },
  { value: 'scotia-chequing', label: 'Scotiabank Chequing' },
  { value: 'scotia-credit',   label: 'Scotiabank Credit Card' },
  { value: 'amex',            label: 'American Express' },
  { value: 'canadian-tire',   label: 'Canadian Tire Triangle' },
];

export default function Import() {
  const transactions   = useStore(s => s.transactions);
  const accessToken    = useStore(s => s.accessToken);
  const addTransactions = useStore(s => s.addTransactions);
  const showToast      = useStore(s => s.showToast);

  // CSV state
  const [bankKey,   setBankKey]   = useState('cibc-chequing');
  const [preview,   setPreview]   = useState(null); // { all, unique } | null
  const [isDragging, setDragging] = useState(false);
  const fileRef = useRef();

  // Gmail state
  const [fromDate,   setFromDate]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [scanning,   setScanning]   = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  // ── CSV ──
  function processText(text) {
    try {
      const all    = parseByBank(text, bankKey);
      const unique = all.filter(t => !transactions.some(x => x.date === t.date && x.amount === t.amount && x.description === t.description));
      setPreview({ all, unique });
    } catch (e) {
      showToast('Parse error: ' + e.message, 'err');
    }
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => processText(e.target.result);
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!preview) return;
    const added = addTransactions(preview.unique);
    showToast(`Imported ${added} transaction${added !== 1 ? 's' : ''}`);
    setPreview(null);
  }

  // ── Gmail ──
  async function handleScan() {
    if (!accessToken) { showToast('Connect Gmail first', 'err'); return; }
    setScanning(true);
    setScanStatus('Starting…');
    try {
      const { found, scanned } = await scanGmail({
        accessToken,
        fromDate,
        onProgress: setScanStatus,
        transactions,
      });
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-2">

        {/* ── CSV ── */}
        <div className="card">
          <div className="card-title">📂 CSV Import</div>
          <p className="text-muted mb-4">Download your transaction history CSV from online banking and upload here.</p>

          <div className="form-row">
            <label className="field-label">Bank / Account</label>
            <select className="w-full" value={bankKey} onChange={e => { setBankKey(e.target.value); setPreview(null); }}>
              {BANK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div
            className={`drop-zone${isDragging ? ' drag' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          >
            <div className="drop-icon">📄</div>
            <div>Drop CSV here or click to browse</div>
            <div className="text-muted mt-2" style={{ fontSize: '12px' }}>
              Supports CIBC · Scotiabank · Amex · CT Triangle
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {preview && (
            <div className="mt-4">
              <div className="text-green mb-2">
                ✓ Found {preview.unique.length} new transaction{preview.unique.length !== 1 ? 's' : ''} ({preview.all.length} total in file)
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', marginBottom: '12px' }}>
                {preview.unique.slice(0, 15).map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px', borderBottom: '1px solid #ffffff09' }}>
                    <span>{t.date} — {t.description.slice(0, 35)}</span>
                    <span className={t.amount < 0 ? 'text-red' : 'text-green'} style={{ marginLeft: '12px' }}>{cad(t.amount)}</span>
                  </div>
                ))}
                {preview.unique.length > 15 && <div className="text-muted text-sm" style={{ padding: '4px 0' }}>…and {preview.unique.length - 15} more</div>}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={confirmImport} disabled={preview.unique.length === 0}>
                  Import {preview.unique.length} transaction{preview.unique.length !== 1 ? 's' : ''}
                </button>
                <button className="btn btn-outline" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Gmail ── */}
        <div className="card">
          <div className="card-title">📧 Gmail Scan</div>
          <p className="text-muted mb-4">Scan your inbox for transaction alerts from CIBC, Scotiabank, Amex, and Canadian Tire.</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'var(--surface2)', borderRadius: '10px', marginBottom: '16px' }}>
            <span style={{ fontSize: '22px' }}>{accessToken ? '✅' : '📬'}</span>
            <div>
              <div style={{ fontWeight: 500 }}>{accessToken ? 'Gmail connected' : 'Not connected'}</div>
              <div className="text-muted text-sm">
                {accessToken ? 'Ready to scan your inbox' : 'Connect Gmail using the button in the header'}
              </div>
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
    </div>
  );
}
