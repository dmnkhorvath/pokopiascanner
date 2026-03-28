import ProgressBar from './ProgressBar';
import './CategoryCard.css';

const CATEGORY_CONFIG = {
  pokemon: { label: 'Pokémon', icon: '🔴', color: 'var(--primary)' },
  items: { label: 'Items', icon: '🎒', color: 'var(--secondary)' },
  habitats: { label: 'Habitats', icon: '🏠', color: 'var(--teal)' },
  recipes: { label: 'Recipes', icon: '📋', color: 'var(--accent)' },
};

export default function CategoryCard({ category, found, total, items = [], onClick }) {
  const config = CATEGORY_CONFIG[category] || { label: category, icon: '📦', color: 'var(--primary)' };
  const percent = total > 0 ? Math.round((found / total) * 100) : 0;

  return (
    <div className="category-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="category-card__header">
        <span className="category-card__icon">{config.icon}</span>
        <h3 className="category-card__title">{config.label}</h3>
        <span className="category-card__badge" style={{ backgroundColor: config.color }}>
          {percent}%
        </span>
      </div>
      <ProgressBar value={found} max={total} color={config.color} size="sm" showPercent={false} />
      <div className="category-card__footer">
        <span>{found} found</span>
        <span>{total} total</span>
      </div>
    </div>
  );
}

export { CATEGORY_CONFIG };
