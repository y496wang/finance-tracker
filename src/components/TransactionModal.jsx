import { useState, useEffect } from 'react';
import useStore from '../store';
import { CATS, ALL_ACCOUNTS } from '../constants';
import { uid } from '../utils';

export default function TransactionModal() {
  const modalTx    = useStore(s => s.modalTx);
  const setModalTx = useStore(s => s.setModalTx);
  const upsertManual = useStore(s => s.upsertManual);
  const showToast  = useStore(s => s.showToast);

  const isEdit = modalTx?.id != null;

  const [form, setForm] = useState({
    date:        '',
    description: '',
    amount:      '',
    category:    'Other',
    account:     ALL_ACCOUNTS[0],
  });

  useEffect(() => {
    if (isEdit) {
      setForm({
        date:        modalTx.date        || '',
        description: modalTx.description || '',
        amount:      modalTx.amount      ?? '',
        category:    modalTx.category    || 'Other',
        account:     modalTx.account     || ALL_ACCOUNTS[0],
      });
    } else {
      setForm({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'Other', account: ALL_ACCOUNTS[0] });
    }
  }, [modalTx]);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function save() {
    const amount = parseFloat(form.amount);
    if (!form.date || !form.description.trim() || isNaN(amount)) {
      showToast('Fill in all fields', 'err'); return;
    }
    upsertManual({
      id:          isEdit ? modalTx.id : uid(),
      date:        form.date,
      description: form.description.trim(),
      amount:      parseFloat(amount.toFixed(2)),
      category:    form.category,
      account:     form.account,
      source:      isEdit ? (modalTx.source || 'manual') : 'manual',
    });
    showToast(isEdit ? 'Transaction updated' : 'Transaction added');
    setModalTx(null);
  }

  return (
    <div className="backdrop" onClick={e => e.target === e.currentTarget && setModalTx(null)}>
      <div className="modal">
        <div className="modal-title">{isEdit ? 'Edit Transaction' : 'Add Transaction'}</div>

        <div className="form-row">
          <label className="field-label">Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label">Description</label>
          <input type="text" placeholder="Merchant name" value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label">Amount (negative = expense)</label>
          <input type="number" step="0.01" placeholder="-45.67" value={form.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div className="form-row">
          <label className="field-label">Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATS.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label className="field-label">Account</label>
          <select value={form.account} onChange={e => set('account', e.target.value)}>
            {ALL_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={() => setModalTx(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
