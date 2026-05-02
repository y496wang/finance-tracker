import { useMemo, useState } from 'react';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import useStore from '../../store';
import SummaryCard from '../SummaryCard';
import { cad, nowMonth } from '../../utils';
import { CAT_COLOR } from '../../constants';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const CHART_DEFAULTS = {
  plugins: { legend: { labels: { color: '#f1f5f9', font: { size: 11 }, boxWidth: 12, padding: 8 } } },
};

export default function Dashboard() {
  const transactions  = useStore(s => s.transactions);
  const monthlyIncome = useStore(s => s.monthlyIncome);
  const [month, setMonth] = useState(nowMonth);

  const monthTxs = useMemo(
    () => transactions.filter(t => t.date.startsWith(month)),
    [transactions, month]
  );

  const expTotal = useMemo(
    () => monthTxs.filter(t => t.amount < 0 && t.category !== 'Income').reduce((s, t) => s + t.amount, 0),
    [monthTxs]
  );
  const incTotal = useMemo(() => {
    const sum = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    return sum || monthlyIncome;
  }, [monthTxs, monthlyIncome]);

  const savings   = incTotal + expTotal;
  const savingsPct = incTotal > 0 ? Math.round((savings / incTotal) * 100) : 0;
  const pctColor   = savingsPct >= 20 ? 'var(--green)' : 'var(--yellow)';

  // Pie data
  const pieData = useMemo(() => {
    const bycat = {};
    monthTxs.filter(t => t.amount < 0 && t.category !== 'Income')
             .forEach(t => { bycat[t.category] = (bycat[t.category] || 0) + Math.abs(t.amount); });
    const labels = Object.keys(bycat);
    return {
      labels,
      datasets: [{
        data:            labels.map(c => bycat[c]),
        backgroundColor: labels.map(c => CAT_COLOR[c] || '#64748b'),
        borderWidth: 0,
      }],
    };
  }, [monthTxs]);

  // Bar data — last 6 months
  const barData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i);
      return d.toISOString().slice(0, 7);
    });
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(y, +mo - 1).toLocaleString('default', { month: 'short' }) + ' ' + y.slice(2);
    });
    const incomeArr = months.map(m => {
      const sum = transactions.filter(t => t.date.startsWith(m) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
      return sum || monthlyIncome;
    });
    const expArr = months.map(m =>
      Math.abs(transactions.filter(t => t.date.startsWith(m) && t.amount < 0 && t.category !== 'Income').reduce((s, t) => s + t.amount, 0))
    );
    return {
      labels,
      datasets: [
        { label: 'Income',   data: incomeArr, backgroundColor: '#22c55e55', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 },
        { label: 'Expenses', data: expArr,    backgroundColor: '#ef444455', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 },
      ],
    };
  }, [transactions, monthlyIncome]);

  const pieOptions = {
    responsive: true,
    ...CHART_DEFAULTS,
    plugins: {
      ...CHART_DEFAULTS.plugins,
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${cad(ctx.raw)}` } },
    },
  };

  const barOptions = {
    responsive: true,
    ...CHART_DEFAULTS,
    plugins: {
      ...CHART_DEFAULTS.plugins,
      tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${cad(ctx.raw)}` } },
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#ffffff0d' } },
      y: { ticks: { color: '#94a3b8', callback: v => cad(v) }, grid: { color: '#ffffff0d' } },
    },
  };

  return (
    <div>
      <div className="flex between center mb-4">
        <h2 className="section-title">Dashboard</h2>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }} className="grid-4">
        <SummaryCard label="Monthly Income"  value={cad(incTotal)}         color="var(--green)" />
        <SummaryCard label="Total Expenses"  value={cad(Math.abs(expTotal))} color="var(--red)" />
        <SummaryCard label="Net Savings"     value={cad(savings)}           color={savings >= 0 ? 'var(--green)' : 'var(--red)'} />
        <SummaryCard label="Savings Rate"    value={`${savingsPct}%`}       color={pctColor} progress={savingsPct} progressColor={pctColor} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2">
        <div className="card">
          <div className="card-title">Spending by Category</div>
          {pieData.labels.length > 0
            ? <Doughnut data={pieData} options={pieOptions} />
            : <p className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>No expense data for this month</p>
          }
        </div>
        <div className="card">
          <div className="card-title">Monthly Overview (6 months)</div>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>
    </div>
  );
}
