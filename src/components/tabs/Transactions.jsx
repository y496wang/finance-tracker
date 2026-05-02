import { useMemo } from 'react';
import useStore from '../../store';
import { CATS, CAT_ICON } from '../../constants';
import { cad } from '../../utils';

export default function Transactions() {
  const transactions = useStore(s => s.transactions);
  const filters      = useStore(s => s.filters);
  const sortField    = useStore(s => s.sortField);
  const sortDir      = useStore(s => s.sortDir);
  const setFilter    = useStore(s => s.setFilter);
  const clearFilters = useStore(s => s.clearFilters);
  const setSort      = useStore(s => s.setSort);
  const updateTx     = useStore(s => s.updateTx);
  const deleteTx     = useStore(s => s.deleteTx);
  const setModalTx   = useStore(s => s.setModalTx);
  const showToast    = useStore(s => s.showToast);

  const allCategories = useMemo(() => [...new Set(transactions.map(t => t.category))].sort(), [transactions]);
  const allAccounts   = useMemo(() => [...new Set(transactions.map(t => t.account).filter(Boolean))].sort(), [transactions]);

  const filtered = useMemo(() => {
    let txs = [...transactions];
    if (filters.month)    txs = txs.filter(t => t.date.startsWith(filters.month));
    if (filters.category) txs = txs.filter(t => t.category === filters.category);
    if (filters.account)  txs = txs.filter(t => t.account === filters.account);
    if (filters.search)   txs = txs.filter(t => t.description.toLowerCase().includes(filters.search.toLowerCase()));
    txs.sort((a, b) => {
      const va = a[sortField] ?? '';
      const vb = b[sortField] ?? '';
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return txs;
  }, [transactions, filters, sortField, sortDir]);

  function exportCSV() {
    const rows = [
      ['Date', 'Description', 'Amount', 'Category', 'Account', 'Source'],
      ...filtered.map(t => [t.date, `"${t.description}"`, t.amount, t.category, t.account || '', t.source]),
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function confirmDelete(id) {
    if (!confirm('Delete this transaction?')) return;
    deleteTx(id);
    showToast('Transaction deleted');
  }

  function SortTh({ field, children }) {
    const active = sortField === field;
    return (
      <th className="sortable" onClick={() => setSort(field)}>
        {children} {active ? (sortDir === -1 ? '↓' : '↑') : '↕'}
      </th>
    );
  }

  return (
    <div>
      <div className="flex between center mb-4">
        <h2 className="section-title">Transactions</h2>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => setModalTx({})}>+ Add</button>
          <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 center wrap mb-4">
        <input
          type="month" value={filters.month}
          onChange={e => setFilter('month', e.target.value)}
          placeholder="Month"
        />
        <select value={filters.category} onChange={e => setFilter('category', e.target.value)}>
          <option value="">All Categories</option>
          {allCategories.map(c => <option key={c} value={c}>{CAT_ICON[c] || ''} {c}</option>)}
        </select>
        <select value={filters.account} onChange={e => setFilter('account', e.target.value)}>
          <option value="">All Accounts</option>
          {allAccounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="text" placeholder="Search…" value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          style={{ width: '200px' }}
        />
        <button className="btn btn-outline" onClick={clearFilters}>Clear</button>
        <span className="text-muted text-sm">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '40px' }}>
            No transactions found. Import from CSV or Gmail, or add manually.
          </p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh field="date">Date</SortTh>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Account</th>
                  <SortTh field="amount">Amount</SortTh>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{t.date}</td>
                    <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                    <td>
                      <select
                        value={t.category}
                        onChange={e => updateTx(t.id, { category: e.target.value })}
                        style={{ minWidth: '170px' }}
                      >
                        {CATS.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
                      </select>
                    </td>
                    <td className="text-muted text-sm" style={{ whiteSpace: 'nowrap' }}>{t.account || '—'}</td>
                    <td
                      style={{ whiteSpace: 'nowrap', fontWeight: 600 }}
                      className={t.amount < 0 ? 'text-red' : 'text-green'}
                    >
                      {cad(t.amount)}
                    </td>
                    <td><span className={`badge badge-${t.source}`}>{t.source}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-outline btn-sm" onClick={() => setModalTx(t)}>Edit</button>
                        <button className="btn btn-danger  btn-sm" onClick={() => confirmDelete(t.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
