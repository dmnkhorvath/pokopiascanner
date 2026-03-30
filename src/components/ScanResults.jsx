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

const CATEGORY_BORDER = {
  pokemon: 'border-l-primary',
  items: 'border-l-secondary',
  habitats: 'border-l-info',
  recipes: 'border-l-accent',
};

const CATEGORY_TEXT = {
  pokemon: 'text-primary',
  items: 'text-secondary',
  habitats: 'text-info',
  recipes: 'text-accent',
};

export default function ScanResults({ results, onNewScan, onImportResults }) {
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [builtFilter, setBuiltFilter] = useState('all');
  const [capturedFilter, setCapturedFilter] = useState('all');
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

    if (builtFilter !== 'all') {
      items = items.filter(item => {
        if (item._category !== 'habitats') return true;
        return builtFilter === 'built' ? item.built === true : item.built === false;
      });
    }

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Scan Results</h2>
          <p className="text-sm text-base-content/50">
            {results?.scanDate
              ? `Scanned: ${new Date(results.scanDate).toLocaleString()}`
              : 'No scan data'}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onNewScan}>New Scan</button>
      </div>

      {/* Overall Progress */}
      <div className="space-y-4">
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Overall Collection Progress</h3>
            <ProgressBar value={totalFound} max={totalPossible} size="lg" color="primary" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="space-y-3">
        {/* Tabs */}
        <div className="tabs tabs-box">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`tab gap-1 ${activeTab === tab.key ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.key !== 'all' && (
                <span className="badge badge-sm badge-ghost">
                  {categories[tab.key]?.found || 0}
                  {tab.key === 'pokemon' && categories.pokemon.items.some(p => p.captured != null) && (
                    <span className="ml-0.5">({categories.pokemon.items.filter(p => p.captured).length}✅)</span>
                  )}
                  {tab.key === 'habitats' && categories.habitats.items.some(h => h.built != null) && (
                    <span className="ml-0.5">({categories.habitats.items.filter(h => h.built).length}✅)</span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-bordered input-sm w-full pr-8"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Built filter */}
          {(activeTab === 'habitats' || activeTab === 'all') && (
            <div className="join">
              <button
                className={`btn btn-xs join-item ${builtFilter === 'all' ? 'btn-active' : ''}`}
                onClick={() => setBuiltFilter('all')}
              >All</button>
              <button
                className={`btn btn-xs join-item ${builtFilter === 'built' ? 'btn-active' : ''}`}
                onClick={() => setBuiltFilter('built')}
              >✅ Built</button>
              <button
                className={`btn btn-xs join-item ${builtFilter === 'notbuilt' ? 'btn-active' : ''}`}
                onClick={() => setBuiltFilter('notbuilt')}
              >❌ Not Built</button>
            </div>
          )}

          {/* Captured filter */}
          {(activeTab === 'pokemon' || activeTab === 'all') && (
            <div className="join">
              <button
                className={`btn btn-xs join-item ${capturedFilter === 'all' ? 'btn-active' : ''}`}
                onClick={() => setCapturedFilter('all')}
              >All</button>
              <button
                className={`btn btn-xs join-item ${capturedFilter === 'captured' ? 'btn-active' : ''}`}
                onClick={() => setCapturedFilter('captured')}
              >✅ Captured</button>
              <button
                className={`btn btn-xs join-item ${capturedFilter === 'sensed' ? 'btn-active' : ''}`}
                onClick={() => setCapturedFilter('sensed')}
              >👁️ Sensed</button>
            </div>
          )}

          {/* View toggle */}
          <div className="join">
            <button
              className={`btn btn-xs join-item ${viewMode === 'grid' ? 'btn-active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >▦</button>
            <button
              className={`btn btn-xs join-item ${viewMode === 'list' ? 'btn-active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >☰</button>
          </div>
        </div>
      </div>

      {/* Items Display */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-base-content/40">
          <p>{searchQuery ? 'No items match your search.' : 'No items found in this category.'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filteredItems.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className={`card bg-base-200 border-l-4 ${CATEGORY_BORDER[item._category] || 'border-l-base-content/20'}`}
            >
              <div className="card-body p-3 gap-1">
                <span className="font-medium text-sm truncate">{item.name}</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {item.number && <span className="badge badge-ghost badge-xs">{item.number}</span>}
                  {item._category === 'habitats' && item.built != null && (
                    <span className={`badge badge-xs ${item.built ? 'badge-success' : 'badge-error'}`}>
                      {item.built ? '✅ Built' : '❌ Not Built'}
                    </span>
                  )}
                  {item._category === 'pokemon' && item.captured != null && (
                    <span className={`badge badge-xs ${item.captured ? 'badge-success' : 'badge-warning'}`}>
                      {item.captured ? '✅ Captured' : '👁️ Sensed'}
                    </span>
                  )}
                </div>
                <span className={`text-xs ${CATEGORY_TEXT[item._category] || ''}`}>{item._category}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredItems.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className={`flex items-center gap-3 px-3 py-2 bg-base-200 rounded-lg border-l-4 ${CATEGORY_BORDER[item._category] || 'border-l-base-content/20'}`}
            >
              <span className="font-medium text-sm flex-1 truncate">{item.name}</span>
              {item.number && <span className="badge badge-ghost badge-xs">{item.number}</span>}
              {item.category && <span className="badge badge-ghost badge-xs">{item.category}</span>}
              {item._category === 'habitats' && item.built != null && (
                <span className={`badge badge-xs ${item.built ? 'badge-success' : 'badge-error'}`}>
                  {item.built ? '✅ Built' : '❌ Not Built'}
                </span>
              )}
              {item._category === 'pokemon' && item.captured != null && (
                <span className={`badge badge-xs ${item.captured ? 'badge-success' : 'badge-warning'}`}>
                  {item.captured ? '✅ Captured' : '👁️ Sensed'}
                </span>
              )}
              <span className={`text-xs ${CATEGORY_TEXT[item._category] || ''}`}>{item._category}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-wrap gap-2 justify-center pt-4 border-t border-base-content/10">
        <button className="btn btn-primary btn-sm gap-1" onClick={handleExport}>
          📥 Export JSON
        </button>
        <button
          className={`btn btn-sm gap-1 ${copySuccess ? 'btn-success' : 'btn-secondary'}`}
          onClick={handleCopyToClipboard}
        >
          {copySuccess ? '✅ Copied!' : '📋 Copy to Clipboard'}
        </button>
        <label className="btn btn-secondary btn-sm gap-1 cursor-pointer">
          📂 Import & Merge
          <input type="file" accept=".json" onChange={handleImport} hidden />
        </label>
      </div>
    </div>
  );
}
