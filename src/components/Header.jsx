import useStore from '../store';
import { initOAuth } from '../parsers/gmail';

export default function Header() {
  const accessToken    = useStore(s => s.accessToken);
  const clientId       = useStore(s => s.clientId);
  const setAccessToken = useStore(s => s.setAccessToken);
  const setActiveTab   = useStore(s => s.setActiveTab);
  const showToast      = useStore(s => s.showToast);

  function handleConnect() {
    if (accessToken) {
      setAccessToken(null);
      showToast('Disconnected from Gmail');
      return;
    }
    if (!clientId) {
      setActiveTab('settings');
      showToast('Add your OAuth Client ID in Settings first', 'err');
      return;
    }
    if (!window._gc) {
      // Try to init now in case GIS loaded after App mount
      window._gc = initOAuth(
        clientId,
        token => { setAccessToken(token); showToast('Gmail connected'); },
        err   => showToast('Auth failed: ' + err, 'err'),
      );
    }
    if (window._gc) window._gc.requestAccessToken();
    else showToast('Google OAuth not ready — check Client ID in Settings', 'err');
  }

  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '0 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', height: '56px',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>
        💰 Finance Tracker
      </div>
      <div className="flex gap-2 center">
        {accessToken && (
          <span className="text-muted text-sm">Gmail connected</span>
        )}
        <button className="btn btn-outline" onClick={handleConnect}>
          {accessToken ? 'Disconnect' : 'Connect Gmail'}
        </button>
      </div>
    </header>
  );
}
