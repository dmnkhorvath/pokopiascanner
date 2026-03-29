import ProgressBar from './ProgressBar';
import './CategoryCard.css';

const CATEGORY_CONFIG = {
  pokemon: { label: 'Pokémon', icon: '🔴', color: 'primary' },
  items: { label: 'Items', icon: '🎒', color: 'secondary' },
  habitats: { label: 'Habitats', icon: '🏠', color: 'info' },
  recipes: { label: 'Recipes', icon: '📋', color: 'accent' },
};

export default function CategoryCard({ category, found, total, items = [], onClick }) {
  const config = CATEGORY_CONFIG[category] || { label: category, icon: '📦', color: 'primary' };
  const percent = total > 0 ? Math.round((found / total) * 100) : 0;

  // Map color name to DaisyUI badge class
  const badgeColor = {
    primary: 'badge-primary',
    secondary: 'badge-secondary',
    info: 'badge-info',
    accent: 'badge-accent',
  }[config.color] || 'badge-primary';

  // Map to progress color prop
  const progressColor = config.color;

  return (
    <div
      className="card bg-base-200 hover:bg-base-300 cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg"
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="card-body p-4 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.icon}</span>
            <h3 className="card-title text-base">{config.label}</h3>
          </div>
          <span className={`badge ${badgeColor} badge-sm font-bold`}>
            {percent}%
          </span>
        </div>
        <ProgressBar value={found} max={total} color={progressColor} size="sm" showPercent={false} />
        <div className="flex justify-between text-xs text-base-content/60">
          <span>{found} found</span>
          <span>{total} total</span>
        </div>
      </div>
    </div>
  );
}

export { CATEGORY_CONFIG };
