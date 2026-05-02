import useStore from '../store';

const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'import',       label: 'Import' },
  { id: 'settings',     label: 'Settings' },
];

export default function Nav() {
  const activeTab  = useStore(s => s.activeTab);
  const setActiveTab = useStore(s => s.setActiveTab);

  return (
    <nav style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '0 24px', display: 'flex', gap: '4px',
    }}>
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
          onClick={() => setActiveTab(t.id)}
          style={{
            padding: '12px 16px', background: 'none', border: 'none',
            borderBottom: `2px solid ${activeTab === t.id ? 'var(--primary)' : 'transparent'}`,
            color: activeTab === t.id ? 'var(--primary)' : 'var(--muted)',
            cursor: 'pointer', fontSize: '14px', fontWeight: 500, transition: 'all .15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
