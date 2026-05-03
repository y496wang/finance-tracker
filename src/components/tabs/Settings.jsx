import { useState } from 'react';
import useStore from '../../store';
import { CATS } from '../../constants';
import { initOAuth } from '../../parsers/gmail';

export default function Settings() {
  const monthlyIncome  = useStore(s => s.monthlyIncome);
  const clientId       = useStore(s => s.clientId);
  const anthropicKey   = useStore(s => s.anthropicKey);
  const setMonthlyIncome = useStore(s => s.setMonthlyIncome);
  const setClientId      = useStore(s => s.setClientId);
  const setAnthropicKey  = useStore(s => s.setAnthropicKey);
  const setAccessToken   = useStore(s => s.setAccessToken);
  const clearAll         = useStore(s => s.clearAll);
  const showToast        = useStore(s => s.showToast);

  const [income, setIncome]   = useState(monthlyIncome || '');
  const [aKey,   setAKey]     = useState(anthropicKey || '');
  const [cid,    setCid]      = useState(clientId || '');

  function saveIncome() {
    const v = parseFloat(income);
    if (isNaN(v)) { showToast('Invalid amount', 'err'); return; }
    setMonthlyIncome(v);
    showToast('Income saved');
  }

  function saveClientId() {
    setClientId(cid.trim());
    // Re-init OAuth with new client ID
    window._gc = initOAuth(
      cid.trim(),
      token => { setAccessToken(token); showToast('Gmail connected'); },
      err   => showToast('Auth failed: ' + err, 'err'),
    );
    showToast('Client ID saved — try connecting Gmail now');
  }

  function handleClearAll() {
    if (!confirm('Delete ALL transactions and settings? This cannot be undone.')) return;
    clearAll();
    localStorage.removeItem('finance-tracker-v1');
    showToast('All data cleared');
  }

  return (
    <div>
      <h2 className="section-title mb-4">Settings</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="grid-2">

        {/* Income */}
        <div className="card">
          <div className="card-title">Monthly Income</div>
          <p className="text-muted mb-4">Your expected monthly take-home pay (CAD). Used when no income transactions are found.</p>
          <label className="field-label">Default monthly income</label>
          <div className="flex gap-2">
            <input
              type="number" placeholder="5000" value={income}
              onChange={e => setIncome(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={saveIncome}>Save</button>
          </div>
        </div>

        {/* Anthropic API key */}
        <div className="card">
          <div className="card-title">Claude AI — PDF Parsing</div>
          <p className="text-muted mb-4">
            Uses <strong>claude-opus-4-7</strong> to extract transactions from PDF statements.
            Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>console.anthropic.com</a>.
            Your key is stored locally and sent only to Anthropic.
          </p>
          <label className="field-label">Anthropic API Key</label>
          <input
            type="password" placeholder="sk-ant-..." value={aKey}
            onChange={e => setAKey(e.target.value)} className="w-full mb-2"
          />
          <button className="btn btn-primary mt-2" onClick={() => { setAnthropicKey(aKey.trim()); showToast('API key saved'); }}>
            Save
          </button>
          {anthropicKey && <div className="text-green mt-2" style={{ fontSize: '13px' }}>✓ Key configured — Claude AI parsing is active</div>}
        </div>

        {/* Google OAuth */}
        <div className="card">
          <div className="card-title">Google OAuth Setup</div>
          <p className="text-muted mb-4">
            Required for Gmail scanning.{' '}
            <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
              Create credentials →
            </a>
          </p>
          <label className="field-label">OAuth 2.0 Client ID</label>
          <input
            type="text" placeholder="xxxx.apps.googleusercontent.com" value={cid}
            onChange={e => setCid(e.target.value)} className="w-full mb-2"
          />
          <button className="btn btn-primary mt-2" onClick={saveClientId}>Save &amp; Activate</button>

          <details style={{ marginTop: '16px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--muted)' }}>
              How to get a Client ID
            </summary>
            <ol style={{ padding: '12px 0 0 18px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.9 }}>
              <li>Open <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>console.cloud.google.com</a></li>
              <li>Create a project → Enable <strong>Gmail API</strong></li>
              <li>Credentials → Create OAuth 2.0 Client ID</li>
              <li>Type: <strong>Web application</strong></li>
              <li>
                Authorized JS Origins — add your GitHub Pages URL:<br />
                <code style={{ background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>
                  https://y496wang.github.io
                </code>
              </li>
              <li>Copy the Client ID and paste above</li>
            </ol>
          </details>
        </div>

        {/* Categories */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-title">Transaction Categories</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CATS.map(c => (
              <span key={c.name} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px',
                background: c.color + '22',
                border: `1px solid ${c.color}55`,
                borderRadius: '20px', fontSize: '13px',
              }}>
                {c.icon} {c.name}
              </span>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="card" style={{ gridColumn: 'span 2', borderColor: '#ef444433' }}>
          <div className="flex between center">
            <div>
              <div style={{ fontWeight: 600 }}>Clear all data</div>
              <div className="text-muted text-sm">Permanently remove all transactions and settings from this browser</div>
            </div>
            <button className="btn btn-danger" onClick={handleClearAll}>Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}
