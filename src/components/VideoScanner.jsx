import { useState, useEffect, useRef, useCallback } from 'react';
import { scanVideo } from '../utils/ocrEngine.js';
import ProgressBar from './ProgressBar';
import './VideoScanner.css';

export default function VideoScanner({ videoFile, settings, onScanComplete, onCancel }) {
  const [progress, setProgress] = useState({
    phase: 'init',
    current: 0,
    total: 0,
    percent: 0,
    message: 'Preparing scanner...',
    currentFrame: null,
  });
  const [recentItems, setRecentItems] = useState([]);
  const [foundCounts, setFoundCounts] = useState({
    pokemon: 0, item: 0, habitat: 0, recipe: 0,
  });
  const abortRef = useRef(null);
  const scanStarted = useRef(false);

  const handleProgress = useCallback((p) => {
    setProgress(p);
  }, []);

  const handleMatch = useCallback(({ items }) => {
    setRecentItems(prev => {
      const updated = [...items.map(i => ({ ...i, time: Date.now() })), ...prev];
      return updated.slice(0, 50);
    });
    setFoundCounts(prev => {
      const next = { ...prev };
      for (const item of items) {
        if (next[item.type] !== undefined) {
          next[item.type]++;
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (scanStarted.current) return;
    scanStarted.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    scanVideo(videoFile, settings, handleProgress, handleMatch, controller.signal)
      .then((results) => {
        onScanComplete(results);
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.log('Scan cancelled');
        } else {
          console.error('Scan error:', err);
          setProgress(prev => ({
            ...prev,
            phase: 'error',
            message: `Error: ${err.message}`,
          }));
        }
      });

    return () => {
      controller.abort();
    };
  }, [videoFile, settings, handleProgress, handleMatch, onScanComplete]);

  const handleCancel = () => {
    abortRef.current?.abort();
    onCancel();
  };

  const totalFound = Object.values(foundCounts).reduce((a, b) => a + b, 0);

  const TYPE_LABELS = {
    pokemon: { label: 'Pokémon', icon: '🔴' },
    item: { label: 'Items', icon: '🎒' },
    habitat: { label: 'Habitats', icon: '🏠' },
    recipe: { label: 'Recipes', icon: '📋' },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {progress.phase === 'complete' ? '✅ Scan Complete' :
           progress.phase === 'error' ? '❌ Scan Error' :
           '🔍 Scanning...'}
        </h2>
        <button className="btn btn-outline btn-sm" onClick={handleCancel}>
          {progress.phase === 'complete' || progress.phase === 'error' ? 'Back' : 'Cancel'}
        </button>
      </div>

      {/* Progress */}
      <div className="space-y-1">
        <ProgressBar
          value={progress.current}
          max={progress.total}
          label={progress.message}
          size="lg"
        />
        {progress.timePosition !== undefined && (
          <p className="text-xs text-base-content/50 text-right">
            {Math.floor(progress.timePosition)}s / {Math.floor(progress.duration)}s
          </p>
        )}
      </div>

      {/* Body: Preview + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Frame Preview */}
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Current Frame</h3>
            <div className="aspect-video bg-base-300 rounded-lg overflow-hidden flex items-center justify-center">
              {progress.currentFrame ? (
                <img
                  src={progress.currentFrame}
                  alt="Current frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-base-content/40 text-sm">Waiting for first frame...</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Stats */}
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Found Items ({totalFound})</h3>

            {/* Counters */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_LABELS).map(([type, { label, icon }]) => (
                <div key={type} className="flex items-center gap-2 bg-base-300 rounded-lg px-3 py-2">
                  <span className="text-lg">{icon}</span>
                  <span className="text-xs text-base-content/60 flex-1">{label}</span>
                  <span className="font-bold text-sm">{foundCounts[type]}</span>
                </div>
              ))}
            </div>

            {/* Recent Items Feed */}
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-base-content/50 mb-2">Recent Detections</h4>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {recentItems.length === 0 ? (
                  <p className="text-xs text-base-content/40 italic">No items detected yet...</p>
                ) : (
                  recentItems.slice(0, 20).map((item, i) => (
                    <div key={`${item.name}-${i}`} className="flex items-center gap-2 text-xs bg-base-300/50 rounded px-2 py-1">
                      <span>{TYPE_LABELS[item.type]?.icon || '📦'}</span>
                      <span className="flex-1 truncate font-medium">{item.name}</span>
                      <span className="badge badge-ghost badge-xs">{item.type}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
