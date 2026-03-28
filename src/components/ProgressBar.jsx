import './ProgressBar.css';

export default function ProgressBar({ value, max, label, color = 'var(--primary)', showPercent = true, size = 'md' }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className={`progress-bar progress-bar--${size}`}>
      {label && <div className="progress-bar__label">{label}</div>}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <div className="progress-bar__info">
        <span className="progress-bar__count">{value}/{max}</span>
        {showPercent && <span className="progress-bar__percent">{percent}%</span>}
      </div>
    </div>
  );
}
