import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // ── Persisted ──
      transactions: [],
      monthlyIncome: 0,
      clientId: '',
      anthropicKey: '',

      // ── Session ──
      accessToken: null,
      driveToken: null,
      activeTab: 'dashboard',
      toast: null,
      sortField: 'date',
      sortDir: -1,
      filters: { month: '', category: '', account: '', search: '' },
      modalTx: null,       // null = closed | {} = new | { id, ... } = edit

      // ── Transaction actions ──
      addTransactions(incoming) {
        const existing = get().transactions;
        const unique = incoming.filter(
          t => !existing.some(x => x.date === t.date && x.amount === t.amount && x.description === t.description)
        );
        set({
          transactions: [...unique, ...existing].sort((a, b) => b.date.localeCompare(a.date)),
        });
        return unique.length;
      },
      updateTx(id, patch) {
        set(s => ({ transactions: s.transactions.map(t => t.id === id ? { ...t, ...patch } : t) }));
      },
      deleteTx(id) {
        set(s => ({ transactions: s.transactions.filter(t => t.id !== id) }));
      },
      upsertManual(tx) {
        const existing = get().transactions;
        if (tx.id && existing.find(t => t.id === tx.id)) {
          set(s => ({ transactions: s.transactions.map(t => t.id === tx.id ? tx : t) }));
        } else {
          set(s => ({
            transactions: [tx, ...s.transactions].sort((a, b) => b.date.localeCompare(a.date)),
          }));
        }
      },

      // ── Settings ──
      setMonthlyIncome: v  => set({ monthlyIncome: v }),
      setClientId:      v  => set({ clientId: v }),
      setAnthropicKey:  v  => set({ anthropicKey: v }),
      setAccessToken:   v  => set({ accessToken: v }),
      setDriveToken:    v  => set({ driveToken: v }),
      clearAll() {
        set({ transactions: [], monthlyIncome: 0, clientId: '' });
      },

      // ── UI ──
      setActiveTab: tab => set({ activeTab: tab }),
      setFilter:    (key, val) => set(s => ({ filters: { ...s.filters, [key]: val } })),
      clearFilters: ()  => set({ filters: { month: '', category: '', account: '', search: '' } }),
      setSort(field) {
        set(s => ({
          sortField: field,
          sortDir: s.sortField === field ? s.sortDir * -1 : -1,
        }));
      },
      setModalTx: tx => set({ modalTx: tx }),

      showToast(msg, type = 'ok') {
        set({ toast: { msg, type } });
        setTimeout(() => set({ toast: null }), 3200);
      },
    }),
    {
      name: 'finance-tracker-v1',
      partialize: s => ({
        transactions:  s.transactions,
        monthlyIncome: s.monthlyIncome,
        clientId:      s.clientId,
        anthropicKey:  s.anthropicKey,
      }),
    }
  )
);

export default useStore;
