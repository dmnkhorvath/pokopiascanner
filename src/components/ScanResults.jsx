import { useState, useMemo } from 'react';
import CategoryCard from './CategoryCard';
import ProgressBar from './ProgressBar';
import './ScanResults.css';

const TABS = [
  { key: 'all', label: 'All', icon: '📊' },
  { key: 'pokemon', label: 'Pokémon', icon: '🔴' },
  { key: 'items', label: 'Items', icon: '🎒' },
  { key: 'habitats', label: 'Habitats', icon: '🏠' },
  { key: 'recipes', label: 'Recipes', icon: '📋' },
];

const CATEGORY_COLORS = {
  pokemon: 'var(--primary)',
  items: 'var(--secondary)',
  habitats: 'var(--teal)',
  recipes: 'var(--accent)',
};

export default function ScanResults({ results, onNewScan, onImportResults }) {
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [builtFilter, setBuiltFilter] = useState('all'); // 'all', 'built', 'notbuilt'
  const [capturedFilter, setCapturedFilter] = useState('all'); // 'all', 'captured', 'sensed'
  const [copySuccess, setCopySuccess] = useState(false);

  const categories = useMemo(() => ({
    pokemon: results?.pokemon || { found: 0, total: 300, items: [] },
    items: results?.items || { found: 0, total: 1254, items: [] },
    habitats: results?.habitats || { found: 0, total: 209, items: [] },
    recipes: results?.recipes || { found: 0, total: 743, items: [] },
  }), [results]);

  const filteredItems = useMemo(() => {
    let items = [];
    const query = searchQuery.toLowerCase().trim();

    if (activeTab === 'all') {
      for (const [catKey, cat] of Object.entries(categories)) {
        for (const item of cat.items) {
          items.push({ ...item, _category: catKey });
        }
      }
    } else {
      const cat = categories[activeTab];
      if (cat) {
        items = cat.items.map(item => ({ ...item, _category: activeTab }));
      }
    }

    if (query) {
      items = items.filter(item => {
        const name = (item.name || '').toLowerCase();
        const category = (item.category || item._category || '').toLowerCase();
        return name.includes(query) || category.includes(query);
      });
    }

    // Apply built filter for habitats
    if (builtFilter !== 'all') {
      items = items.filter(item => {
        if (item._category !== 'habitats') return true;
        return builtFilter === 'built' ? item.built === true : item.built === false;
      });
    }

    // Apply captured filter for pokemon
    if (capturedFilter !== 'all') {
      items = items.filter(item => {
        if (item._category !== 'pokemon') return true;
        return capturedFilter === 'captured' ? item.captured === true : item.captured === false;
      });
    }

    return items;
  }, [activeTab, categories, searchQuery, builtFilter, capturedFilter]);

  const handleExport = () => {
    const exportData = {
      scanDate: results?.scanDate || new Date().toISOString(),
      totalFound: results?.totalFound || 0,
      pokemon: {
        found: categories.pokemon.found,
        total: categories.pokemon.total,
        items: categories.pokemon.items.map(i => ({
          name: i.name || i,
          number: i.number || null,
          captured: i.captured != null ? i.captured : null,
        })),
      },
      items: {
        found: categories.items.found,
        total: categories.items.total,
        items: categories.items.items.map(i => i.name || i),
      },
      habitats: {
        found: categories.habitats.found,
        total: categories.habitats.total,
        items: categories.habitats.items.map(i => ({
          name: i.name || i,
          number: i.number || null,
          built: i.built != null ? i.built : null,
        })),
      },
      recipes: {
        found: categories.recipes.found,
        total: categories.recipes.total,
        items: categories.recipes.items.map(i => i.name || i),
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pokopia-scan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    const text = filteredItems.map(i => i.name || i).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onImportResults(data);
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const totalFound = results?.totalFound || 0;
  const totalPossible = 300 + 1254 + 209 + 743;

  return (
    <div className="results">
      {/* Header */}
      <div className="results__header">
        <div className="results__header-left">
          <h2 className="results__title">Scan Results</h2>
          <p className="results__date">
            {results?.scanDate
              ? `Scanned: ${new Date(results.scanDate).toLocaleString()}`
              : 'No scan data'}
          </p>
        </div>
        <div className="results__header-actions">
          <button className="btn btn--primary" onClick={onNewScan}>New Scan</button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="results__overview">
        <div className="results__total">
          <h3>Overall Collection Progress</h3>
          <ProgressBar
            value={totalFound}
            max={totalPossible}
            size="lg"
            color="var(--primary)"
          />
        </div>
        <div className="results__cards">
          {Object.entries(categories).map(([key, cat]) => (
            <CategoryCard
              key={key}
              category={key}
              found={cat.found}
              total={cat.total}
              items={cat.items}
              onClick={() => setActiveTab(key)}
            />
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="results__toolbar">
        <div className="results__tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`results__tab ${activeTab === tab.key ? 'results__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.key !== 'all' && (
                <span className="results__tab-count">
                  {categories[tab.key]?.found || 0}
                  {tab.key === 'pokemon' && categories.pokemon.items.some(p => p.captured != null) && (
                    <span className="results__tab-built-count">
                      {' '}({categories.pokemon.items.filter(p => p.captured).length}✅)
                    </span>
                  )}
                  {tab.key === 'habitats' && categories.habitats.items.some(h => h.built != null) && (
                    <span className="results__tab-built-count">
                      {' '}({categories.habitats.items.filter(h => h.built).length}✅)
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="results__controls">
          <div className="results__search">
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="results__search-input"
            />
            {searchQuery && (
              <button
                className="results__search-clear"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {(activeTab === 'habitats' || activeTab === 'all') && (
            <div className="results__built-filter">
              <button
                className={`results__built-btn ${builtFilter === 'all' ? 'results__built-btn--active' : ''}`}
                onClick={() => setBuiltFilter('all')}
              >All</button>
              <button
                className={`results__built-btn ${builtFilter === 'built' ? 'results__built-btn--active' : ''}`}
                onClick={() => setBuiltFilter('built')}
              >✅ Built</button>
              <button
                className={`results__built-btn ${builtFilter === 'notbuilt' ? 'results__built-btn--active' : ''}`}
                onClick={() => setBuiltFilter('notbuilt')}
              >❌ Not Built</button>
            </div>
          )}

          {(activeTab === 'pokemon' || activeTab === 'all') && (
            <div className="results__built-filter">
              <button
                className={`results__built-btn ${capturedFilter === 'all' ? 'results__built-btn--active' : ''}`}
                onClick={() => setCapturedFilter('all')}
              >All</button>
              <button
                className={`results__built-btn ${capturedFilter === 'captured' ? 'results__built-btn--active' : ''}`}
                onClick={() => setCapturedFilter('captured')}
              >✅ Captured</button>
              <button
                className={`results__built-btn ${capturedFilter === 'sensed' ? 'results__built-btn--active' : ''}`}
                onClick={() => setCapturedFilter('sensed')}
              >👁️ Sensed</button>
            </div>
          )}

                    <div className="results__view-toggle">
            <button
              className={`results__view-btn ${viewMode === 'grid' ? 'results__view-btn--active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              ▦
            </button>
            <button
              className={`results__view-btn ${viewMode === 'list' ? 'results__view-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Items Display */}
      <div className={`results__items results__items--${viewMode}`}>
        {filteredItems.length === 0 ? (
          <div className="results__empty">
            <p>{searchQuery ? 'No items match your search.' : 'No items found in this category.'}</p>
          </div>
        ) : (
          filteredItems.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="results__item"
              style={{ borderLeftColor: CATEGORY_COLORS[item._category] || 'var(--border)' }}
            >
              <span className="results__item-name">{item.name}</span>
              {item.number && <span className="results__item-number">{item.number}</span>}
              {item.category && <span className="results__item-category">{item.category}</span>}
              {item._category === 'habitats' && item.built != null && (
                <span className={`results__item-built ${item.built ? 'results__item-built--yes' : 'results__item-built--no'}`}>
                  {item.built ? '✅ Built' : '❌ Not Built'}
                </span>
              )}
              {item._category === 'pokemon' && item.captured != null && (
                <span className={`results__item-built ${item.captured ? 'results__item-built--yes' : 'results__item-built--no'}`}>
                  {item.captured ? '✅ Captured' : '👁️ Sensed'}
                </span>
              )}
              <span
                className="results__item-type"
                style={{ color: CATEGORY_COLORS[item._category] }}
              >
                {item._category}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="results__footer">
        <button className="btn btn--primary" onClick={handleExport}>
          📥 Export JSON
        </button>
        <button
          className={`btn btn--secondary ${copySuccess ? 'btn--success' : ''}`}
          onClick={handleCopyToClipboard}
        >
          {copySuccess ? '✅ Copied!' : '📋 Copy to Clipboard'}
        </button>
        <label className="btn btn--secondary">
          📂 Import & Merge
          <input type="file" accept=".json" onChange={handleImport} hidden />
        </label>
      </div>
    </div>
  );
}
