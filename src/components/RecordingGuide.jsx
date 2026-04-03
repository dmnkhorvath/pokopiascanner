import { useState } from 'react';
import './RecordingGuide.css';

const CATEGORIES = [
  {
    id: 'pokemon',
    label: 'Pokémon',
    icon: '🐾',
    color: 'badge-primary',
    steps: [
      'Open the Pokédex in Pokopia',
      'Scroll slowly through the list from top to bottom',
      'Keep a steady pace — about 2–3 seconds per page',
      'The scanner reads Pokémon names from the list view',
    ],
    tip: "Don't tap into individual Pokémon details — stay on the list view for best results.",
  },
  {
    id: 'items',
    label: 'Items',
    icon: '🎒',
    color: 'badge-secondary',
    steps: [
      'Open your inventory/bag in Pokopia',
      'Navigate to each item category tab',
      'Scroll slowly through each tab from top to bottom',
      'The scanner uses icon matching — keep the grid fully visible',
    ],
    tip: 'Record each tab separately for best results.',
  },
  {
    id: 'habitats',
    label: 'Habitats',
    icon: '🏠',
    color: 'badge-accent',
    steps: [
      'Open the Habitat list in Pokopia',
      'Scroll through all habitats from top to bottom',
      'The scanner reads habitat names from the list',
    ],
    tip: 'Slow, steady scrolling gives the best OCR accuracy.',
  },
  {
    id: 'recipes',
    label: 'Recipes',
    icon: '🍳',
    color: 'badge-warning',
    steps: [
      'Open the Recipe book in Pokopia',
      'Scroll through all recipes from top to bottom',
      'The scanner reads recipe names from the list',
    ],
    tip: 'Pause briefly at each page for clearer text recognition.',
  },
];

const GENERAL_TIPS = [
  { icon: '📱', text: 'Record in landscape mode' },
  { icon: '🎮', text: "Use the Switch's built-in 30-second recording (hold Capture button) or a capture card" },
  { icon: '💡', text: 'Good lighting helps — avoid glare on the Switch screen' },
  { icon: '🤳', text: 'Steady hands or a phone mount reduces blur' },
  { icon: '⏩', text: 'Fast-forwarding playback is fine — the scanner extracts frames automatically' },
  { icon: '📂', text: 'You can upload multiple videos — one per category works great' },
];

const CHECKLIST = [
  'Switch is charged or plugged in',
  'Screen brightness is set to max',
  'No overlays or notifications blocking the screen',
  'Recording in landscape orientation',
  'Scrolling at a slow, steady pace',
  'Captured all pages/tabs for the category',
  'Video transferred to phone or computer',
];

export default function RecordingGuide({ onBack }) {
  const [activeTab, setActiveTab] = useState('pokemon');
  const [checkedItems, setCheckedItems] = useState({});

  const activeCategory = CATEGORIES.find((c) => c.id === activeTab);

  const toggleCheck = (index) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button className="btn btn-ghost btn-sm gap-1 mb-6" onClick={onBack}>
        ← Back to Scanner
      </button>

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">
          {"📹"} Smart Recording Guide
        </h1>
        <p className="text-base-content/60 max-w-2xl mx-auto">
          Learn exactly how to record your Switch screen for each category.
          Follow these tips to get the best scan results.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="tabs tabs-boxed bg-base-200 p-1 mb-6 flex justify-center gap-1 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`tab gap-2 ${
              activeTab === cat.id ? 'tab-active' : ''
            }`}
            onClick={() => setActiveTab(cat.id)}
          >
            <span>{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Active Category Content */}
      {activeCategory && (
        <div className="card bg-base-200 shadow-md mb-8">
          <div className="card-body">
            {/* Category header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{activeCategory.icon}</span>
              <h2 className="card-title text-xl sm:text-2xl">
                Recording {activeCategory.label}
              </h2>
            </div>

            {/* Numbered steps */}
            <div className="flex flex-col gap-3">
              {activeCategory.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`badge ${activeCategory.color} font-bold min-w-[2rem] h-8 flex items-center justify-center`}>
                    {i + 1}
                  </div>
                  <p className="text-base-content/80 pt-1">{step}</p>
                </div>
              ))}
            </div>

            {/* Pro tip */}
            {activeCategory.tip && (
              <div className="alert alert-info mt-4">
                <span className="text-lg">{"💡"}</span>
                <span className="text-sm">
                  <strong>Pro tip:</strong> {activeCategory.tip}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* General Tips */}
      <div className="card bg-base-200 shadow-md mb-8">
        <div className="card-body">
          <h2 className="card-title text-lg mb-3">
            {"🎯"} General Recording Tips
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {GENERAL_TIPS.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 bg-base-300 rounded-lg p-3">
                <span className="text-xl">{tip.icon}</span>
                <p className="text-sm text-base-content/80">{tip.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recording Checklist */}
      <div className="card bg-base-200 shadow-md mb-8">
        <div className="card-body">
          <h2 className="card-title text-lg mb-3">
            {"✅"} Recording Checklist
          </h2>
          <p className="text-sm text-base-content/60 mb-4">
            Use this checklist before you start recording to make sure everything is set up for the best scan results.
          </p>
          <div className="flex flex-col gap-2">
            {CHECKLIST.map((item, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  checkedItems[i]
                    ? 'bg-success/10 line-through text-base-content/50'
                    : 'bg-base-300 hover:bg-base-300/80'
                }`}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={!!checkedItems[i]}
                  onChange={() => toggleCheck(i)}
                />
                <span className="text-sm">{item}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center mt-10 mb-6">
        <p className="text-base-content/60 mb-3">Ready to scan your collection?</p>
        <button className="btn btn-primary btn-lg gap-2" onClick={onBack}>
          🔍 Start Scanning
        </button>
      </div>
    </div>
  );
}
