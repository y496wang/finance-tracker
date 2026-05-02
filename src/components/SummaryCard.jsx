export default function SummaryCard({ label, value, color, progress, progressColor }) {
  return (
    <div className="card">
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: color || 'var(--text)' }}>
        {value}
      </div>
      {progress !== undefined && (
        <div className="progress">
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: progressColor || 'var(--primary)',
            }}
          />
        </div>
      )}
    </div>
  );
}
