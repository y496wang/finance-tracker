import { useEffect } from 'react';
import useStore from './store';
import { initOAuth } from './parsers/gmail';
import Header from './components/Header';
import Nav from './components/Nav';
import Toast from './components/Toast';
import TransactionModal from './components/TransactionModal';
import Dashboard from './components/tabs/Dashboard';
import Transactions from './components/tabs/Transactions';
import Import from './components/tabs/Import';
import Settings from './components/tabs/Settings';

export default function App() {
  const activeTab = useStore(s => s.activeTab);
  const modalTx   = useStore(s => s.modalTx);
  const clientId  = useStore(s => s.clientId);
  const setAccessToken = useStore(s => s.setAccessToken);
  const showToast      = useStore(s => s.showToast);

  // Initialise Google OAuth once GIS script has loaded
  useEffect(() => {
    if (!clientId) return;
    const tryInit = () => {
      if (typeof google === 'undefined') return;
      window._gc = initOAuth(
        clientId,
        token => { setAccessToken(token); showToast('Gmail connected'); },
        err   => showToast('Auth failed: ' + err, 'err'),
      );
    };
    // GIS may already be loaded or still loading
    if (typeof google !== 'undefined') tryInit();
    else window.addEventListener('load', tryInit, { once: true });
  }, [clientId]);

  return (
    <>
      <Header />
      <Nav />

      <main style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
        {activeTab === 'dashboard'    && <Dashboard />}
        {activeTab === 'transactions' && <Transactions />}
        {activeTab === 'import'       && <Import />}
        {activeTab === 'settings'     && <Settings />}
      </main>

      {modalTx !== null && <TransactionModal />}
      <Toast />
    </>
  );
}
