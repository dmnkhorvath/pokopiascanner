import './ProgressBar.css';

export default function ProgressBar({ value, max, label, color, showPercent = true, size = 'md' }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  const sizeClass = {
    sm: 'progress-sm',
    md: 'progress-md',
    lg: 'progress-lg',
  }[size] || 'progress-md';

  // Map old CSS var colors to DaisyUI color classes
  const colorClass = (() => {
    if (!color) return 'progress-primary';
    if (color.includes('--primary') || color.includes('primary')) return 'progress-primary';
    if (color.includes('--secondary') || color.includes('secondary')) return 'progress-secondary';
    if (color.includes('--teal') || color.includes('info')) return 'progress-info';
    if (color.includes('--accent') || color.includes('accent')) return 'progress-accent';
    return 'progress-primary';
  })();

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <div className="text-sm text-base-content/70">{label}</div>}
      <progress
        className={`progress ${colorClass} ${sizeClass} w-full`}
        value={percent}
        max="100"
      />
      <div className="flex justify-between text-xs text-base-content/60">
        <span>{value}/{max}</span>
        {showPercent && <span>{percent}%</span>}
      </div>
    </div>
  );
}
