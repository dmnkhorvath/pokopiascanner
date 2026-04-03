import { useState, useMemo, useEffect } from 'react';
import { getCategoryTotals } from '../utils/ocrEngine.js';
import { buildNewItemSet } from '../utils/scanDiff.js';
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

const CATEGORY_META = {
  pokemon: { label: 'Pokémon', icon: '🔴', color: '#f87171', bgClass: 'bg-error/10', borderClass: 'border-l-primary', textClass: 'text-primary' },
  items: { label: 'Items', icon: '🎒', color: '#a78bfa', bgClass: 'bg-secondary/10', borderClass: 'border-l-secondary', textClass: 'text-secondary' },
  habitats: { label: 'Habitats', icon: '🏠', color: '#38bdf8', bgClass: 'bg-info/10', borderClass: 'border-l-info', textClass: 'text-info' },
  recipes: { label: 'Recipes', icon: '📋', color: '#34d399', bgClass: 'bg-accent/10', borderClass: 'border-l-accent', textClass: 'text-accent' },
};

/** CSS-only ring chart using conic-gradient */
function RingChart({ percent, size = 120, strokeWidth = 12, color = '#f59e0b', children }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="relative rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${p * 3.6}deg, oklch(var(--b3)) ${p * 3.6}deg)`,
      }}
    >
      <div
        className="rounded-full bg-base-100 flex items-center justify-center"
        style={{ width: size - strokeWidth * 2, height: size - strokeWidth * 2 }}
      >
        {children}
      </div>
    </div>
  );
}

export default function ScanResults({ results, scanCount = 0, onAddMore, onStartFresh, onImportResults, scanDiff }) {
  const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [builtFilter, setBuiltFilter] = useState('all');
  const [capturedFilter, setCapturedFilter] = useState('all');
  const [discoveredFilter, setDiscoveredFilter] = useState('all');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [totals, setTotals] = useState({ pokemon: 300, items: 1254, habitats: 209, recipes: 743 });
  useEffect(() => {
    getCategoryTotals().then(setTotals).catch(() => {});
  }, []);

  const categories = useMemo(() => ({
    pokemon: results?.pokemon || { found: 0, total: totals.pokemon, items: [] },
    items: results?.items || { found: 0, total: totals.items, items: [] },
    habitats: results?.habitats || { found: 0, total: totals.habitats, items: [] },
    recipes: results?.recipes || { found: 0, total: totals.recipes, items: [] },
  }), [results, totals]);

  // Build set of new item names for highlighting
  const newItemNames = useMemo(() => buildNewItemSet(scanDiff), [scanDiff]);
  const hasNewItems = scanDiff && scanDiff.totalNew > 0;


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

    if (discoveredFilter !== 'all') {
      items = items.filter(item => {
        if (item._category !== 'items' && item._category !== 'recipes') return true;
        if (item.discovered == null) return true;
        return discoveredFilter === 'discovered' ? item.discovered === true : item.discovered === false;
      });
    }

    // Filter to new items only if toggle is active
    if (showNewOnly && newItemNames.size > 0) {
      items = items.filter(item => {
        const name = (item.name || '').toLowerCase();
        return newItemNames.has(name);
      });
    }

    return items;
  }, [activeTab, categories, searchQuery, builtFilter, capturedFilter, discoveredFilter, showNewOnly, newItemNames]);

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
        items: categories.items.items.map(i => ({
          name: i.name || i,
          category: i.category || null,
          discovered: i.discovered != null ? i.discovered : null,
        })),
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
        items: categories.recipes.items.map(i => ({
          name: i.name || i,
          category: i.category || null,
          discovered: i.discovered != null ? i.discovered : null,
        })),
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
  const totalPossible = totals.pokemon + totals.items + totals.habitats + totals.recipes;
  const overallPercent = totalPossible > 0 ? Math.round((totalFound / totalPossible) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">📊 Collection Dashboard</h2>
          <p className="text-sm text-base-content/50">
            {scanCount > 0
              ? `Accumulated from ${scanCount} scan${scanCount > 1 ? 's' : ''}`
              : results?.scanDate
                ? `Scanned: ${new Date(results.scanDate).toLocaleString()}`
                : 'No scan data'}
            {' · Auto-saved'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm gap-1" onClick={onAddMore}>
            ➕ Add More Videos
          </button>
          <button className="btn btn-ghost btn-sm gap-1" onClick={onStartFresh}>
            🔄 Start Fresh
          </button>
        </div>
      </div>

      {/* Session info banner */}
      {scanCount > 1 && (
        <div className="alert alert-info">
          <span>📁 This session includes data merged from {scanCount} scans. Results are auto-saved to your browser.</span>
        </div>
      )}

      {/* What's New Banner */}
      {hasNewItems && !bannerDismissed && (
        <div className="alert bg-success/15 border border-success/30 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
            <div className="flex-1">
              <h3 className="font-bold text-success">🎉 You found {scanDiff.totalNew} new item{scanDiff.totalNew !== 1 ? 's' : ''} since your last scan!</h3>
              <div className="flex flex-wrap gap-3 text-sm mt-1">
                {Object.entries(scanDiff.byCategory).map(([cat, data]) => {
                  if (data.new === 0) return null;
                  const meta = CATEGORY_META[cat];
                  return (
                    <span key={cat} className={meta?.textClass || ''}>
                      {meta?.icon} {data.new} new {meta?.label}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className={`btn btn-sm ${showNewOnly ? 'btn-success' : 'btn-outline btn-success'}`}
                onClick={() => setShowNewOnly(prev => !prev)}
              >
                {showNewOnly ? '📋 Show All' : '✨ Show New Only'}
              </button>
              <button
                className="btn btn-ghost btn-sm btn-circle"
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Collection Dashboard */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Overall Ring + Category Rings */}
      <div className="card bg-base-200">
        <div className="card-body p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Main ring */}
            <div className="flex flex-col items-center gap-2">
              <RingChart percent={overallPercent} size={140} strokeWidth={14} color="#f59e0b">
                <div className="text-center">
                  <span className="text-2xl font-bold">{overallPercent}%</span>
                  <p className="text-[10px] text-base-content/50 leading-tight">Complete</p>
                </div>
              </RingChart>
              <p className="text-sm font-medium">{totalFound} / {totalPossible} found</p>
            </div>

            {/* Category breakdown */}
            <div className="flex-1 w-full">
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(categories).map(([key, cat]) => {
                  const meta = CATEGORY_META[key];
                  const pct = cat.total > 0 ? Math.round((cat.found / cat.total) * 100) : 0;
                  return (
                    <div key={key} className={`flex items-center gap-3 rounded-xl p-3 ${meta.bgClass}`}>
                      <RingChart percent={pct} size={56} strokeWidth={6} color={meta.color}>
                        <span className="text-xs font-bold">{pct}%</span>
                      </RingChart>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm flex items-center gap-1">
                          <span>{meta.icon}</span> {meta.label}
                        </p>
                        <p className="text-xs text-base-content/50">
                          {cat.found} / {cat.total}
                        </p>
                        {/* Sub-stats */}
                        {key === 'pokemon' && cat.items.length > 0 && (
                          <p className="text-[10px] text-base-content/40">
                            ✅ {cat.items.filter(i => i.captured).length} captured · 👁️ {cat.items.filter(i => !i.captured).length} sensed
                          </p>
                        )}
                        {key === 'habitats' && cat.items.length > 0 && (
                          <p className="text-[10px] text-base-content/40">
                            ✅ {cat.items.filter(i => i.built).length} built · ❌ {cat.items.filter(i => !i.built).length} not built
                          </p>
                        )}
                        {(key === 'items' || key === 'recipes') && cat.items.length > 0 && (
                          <p className="text-[10px] text-base-content/40">
                            ✅ {cat.items.filter(i => i.discovered).length} discovered · ❓ {cat.items.filter(i => !i.discovered).length} undiscovered
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(categories).map(([key, cat]) => (
          <CategoryCard
            key={key}
            category={key}
            found={cat.found}
            total={cat.total}
            items={cat.items}
            onClick={() => isDebug && setActiveTab(key)}
          />
        ))}
      </div>

      {/* Debug-only: Detailed item browser */}
      {isDebug && (
        <>
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
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
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

            {(activeTab === 'habitats' || activeTab === 'all') && (
              <div className="join">
                <button className={`btn btn-xs join-item ${builtFilter === 'all' ? 'btn-active' : ''}`} onClick={() => setBuiltFilter('all')}>All</button>
                <button className={`btn btn-xs join-item ${builtFilter === 'built' ? 'btn-active' : ''}`} onClick={() => setBuiltFilter('built')}>✅ Built</button>
                <button className={`btn btn-xs join-item ${builtFilter === 'notbuilt' ? 'btn-active' : ''}`} onClick={() => setBuiltFilter('notbuilt')}>❌ Not Built</button>
              </div>
            )}

            {(activeTab === 'pokemon' || activeTab === 'all') && (
              <div className="join">
                <button className={`btn btn-xs join-item ${capturedFilter === 'all' ? 'btn-active' : ''}`} onClick={() => setCapturedFilter('all')}>All</button>
                <button className={`btn btn-xs join-item ${capturedFilter === 'captured' ? 'btn-active' : ''}`} onClick={() => setCapturedFilter('captured')}>✅ Captured</button>
                <button className={`btn btn-xs join-item ${capturedFilter === 'sensed' ? 'btn-active' : ''}`} onClick={() => setCapturedFilter('sensed')}>👁️ Sensed</button>
              </div>
            )}

            {(activeTab === 'items' || activeTab === 'recipes' || activeTab === 'all') && (
              <div className="join">
                <button className={`btn btn-xs join-item ${discoveredFilter === 'all' ? 'btn-active' : ''}`} onClick={() => setDiscoveredFilter('all')}>All</button>
                <button className={`btn btn-xs join-item ${discoveredFilter === 'discovered' ? 'btn-active' : ''}`} onClick={() => setDiscoveredFilter('discovered')}>✅ Discovered</button>
                <button className={`btn btn-xs join-item ${discoveredFilter === 'undiscovered' ? 'btn-active' : ''}`} onClick={() => setDiscoveredFilter('undiscovered')}>❓ Undiscovered</button>
              </div>
            )}
          </div>

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-base-content/40">
              <p>{searchQuery ? 'No items match your search.' : 'No items found in this category.'}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item, i) => {
                const isNew = newItemNames.has((item.name || '').toLowerCase());
                return (
                <div
                  key={`${item.name}-${i}`}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded border-l-4 ${isNew ? 'bg-success/10 border-l-success' : `bg-base-200 ${CATEGORY_META[item._category]?.borderClass || 'border-l-base-content/20'}`}`}
                >
                  <span className="font-medium text-sm flex-1 truncate">{item.name}</span>
                  {isNew && <span className="badge badge-xs badge-success gap-0.5">✨ NEW</span>}
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
                  {(item._category === 'items' || item._category === 'recipes') && item.discovered != null && (
                    <span className={`badge badge-xs ${item.discovered ? 'badge-success' : 'badge-ghost'}`}>
                      {item.discovered ? '✅ Discovered' : '❓ Undiscovered'}
                    </span>
                  )}
                  <span className={`text-xs ${CATEGORY_META[item._category]?.textClass || ''}`}>{item._category}</span>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Footer Actions */}
      <div className="flex flex-col items-center gap-4 pt-6 border-t border-base-content/10">
        <div className="flex flex-wrap gap-2 justify-center">
          <button className="btn btn-success btn-md gap-1" onClick={handleExport}>
            📥 Export All Data
          </button>
          {isDebug && (
            <button
              className={`btn btn-md gap-1 ${copySuccess ? 'btn-success' : 'btn-secondary'}`}
              onClick={handleCopyToClipboard}
            >
              {copySuccess ? '✅ Copied!' : '📋 Copy Names'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <button className="btn btn-primary btn-sm gap-1" onClick={onAddMore}>
            ➕ Add More Videos
          </button>
          <label className="btn btn-ghost btn-sm gap-1 cursor-pointer">
            📂 Import & Merge JSON
            <input type="file" accept=".json" onChange={handleImport} hidden />
          </label>
        </div>
      </div>
    </div>
  );
}
