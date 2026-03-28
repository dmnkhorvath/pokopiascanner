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
    <div className="scanner">
      <div className="scanner__header">
        <h2 className="scanner__title">
          {progress.phase === 'complete' ? '✅ Scan Complete' :
           progress.phase === 'error' ? '❌ Scan Error' :
           '🔍 Scanning...'}
        </h2>
        <button className="scanner__cancel" onClick={handleCancel}>
          {progress.phase === 'complete' || progress.phase === 'error' ? 'Back' : 'Cancel'}
        </button>
      </div>

      {/* Progress */}
      <div className="scanner__progress">
        <ProgressBar
          value={progress.current}
          max={progress.total}
          label={progress.message}
          size="lg"
        />
        {progress.timePosition !== undefined && (
          <div className="scanner__time">
            {Math.floor(progress.timePosition)}s / {Math.floor(progress.duration)}s
          </div>
        )}
      </div>

      <div className="scanner__body">
        {/* Frame Preview */}
        <div className="scanner__preview">
          <h3>Current Frame</h3>
          <div className="scanner__frame-container">
            {progress.currentFrame ? (
              <img
                src={progress.currentFrame}
                alt="Current frame"
                className="scanner__frame"
              />
            ) : (
              <div className="scanner__frame-placeholder">
                Waiting for first frame...
              </div>
            )}
          </div>
        </div>

        {/* Live Stats */}
        <div className="scanner__stats">
          <h3>Found Items ({totalFound})</h3>
          <div className="scanner__counters">
            {Object.entries(TYPE_LABELS).map(([type, { label, icon }]) => (
              <div key={type} className="scanner__counter">
                <span className="scanner__counter-icon">{icon}</span>
                <span className="scanner__counter-label">{label}</span>
                <span className="scanner__counter-value">{foundCounts[type]}</span>
              </div>
            ))}
          </div>

          {/* Recent Items Feed */}
          <div className="scanner__feed">
            <h4>Recent Detections</h4>
            <div className="scanner__feed-list">
              {recentItems.length === 0 ? (
                <p className="scanner__feed-empty">No items detected yet...</p>
              ) : (
                recentItems.slice(0, 20).map((item, i) => (
                  <div key={`${item.name}-${i}`} className="scanner__feed-item">
                    <span className="scanner__feed-type">
                      {TYPE_LABELS[item.type]?.icon || '📦'}
                    </span>
                    <span className="scanner__feed-name">{item.name}</span>
                    <span className="scanner__feed-category">{item.type}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
