import { useState, useEffect, useRef, useCallback } from 'react';
import { scanVideo, mergeResults, SCAN_MODES } from '../utils/ocrEngine.js';
import { detectVideoType } from '../utils/videoDetector.js';
import ProgressBar from './ProgressBar';
import './VideoScanner.css';

const MAX_CONCURRENT = 3;

const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

const DETECTION_MESSAGES = [
  '🔍 Peeking at your video...',
  '🎬 Sampling frames from your recording...',
  '🧪 Analyzing pixel patterns...',
  '🐾 Looking for Pokémon banners...',
  '🏡 Checking for habitat layouts...',
  '🎒 Scanning for item grids...',
  '🍳 Sniffing out recipe pages...',
  '🤔 Hmm, what do we have here...',
  '⚡ Almost there, stay tuned!',
  '🔬 Running our super-smart heuristics...',
  '🎯 Narrowing it down...',
  '✨ Just a moment, magic in progress...',
  '🧠 Teaching pixels to talk...',
  '📊 Crunching the colors...',
  '🌈 Reading the rainbow of your screen...',
  '🕵️ Detective mode activated...',
  '💡 We are halfway through, hang tight!',
  '🚀 Boosting detection engines...',
  '🎮 Recognizing your gameplay style...',
  '🏆 Almost got it, one sec...',
];

const TYPE_LABELS = {
  pokemon: { label: 'Pokémon', icon: '🔴' },
  item: { label: 'Items', icon: '🎒' },
  habitat: { label: 'Habitats', icon: '🏠' },
  recipe: { label: 'Recipes', icon: '📋' },
};

const STATUS_BADGE = {
  queued: { cls: 'badge-ghost', text: 'Queued' },
  detecting: { cls: 'badge-info', text: 'Detecting...' },
  scanning: { cls: 'badge-warning', text: 'Scanning' },
  complete: { cls: 'badge-success', text: 'Complete' },
  error: { cls: 'badge-error', text: 'Error' },
};

function modeEmoji(mode) {
  switch (mode) {
    case 'habitat': return '🏡';
    case 'pokemon': return '🐾';
    case 'item': return '🎒';
    case 'recipe': return '🍳';
    default: return '📦';
  }
}

export default function VideoScanner({ videoFiles, settings, onScanComplete, onCancel }) {
  // Per-video state: array of objects
  const [videoStates, setVideoStates] = useState(() =>
    videoFiles.map((file) => ({
      file,
      status: 'queued', // queued | detecting | scanning | complete | error
      detectedMode: null,
      progress: { phase: 'init', current: 0, total: 0, percent: 0, message: 'Queued...', currentFrame: null },
      recentItems: [],
      foundCounts: { pokemon: 0, item: 0, habitat: 0, recipe: 0 },
      result: null,
      error: null,
    }))
  );

  // Combined recent detections from all videos
  const [combinedRecent, setCombinedRecent] = useState([]);

  // Detection message rotation
  const [detectionMsgIndex, setDetectionMsgIndex] = useState(0);
  const hasDetecting = videoStates.some(v => v.status === 'detecting');
  useEffect(() => {
    if (!hasDetecting) { setDetectionMsgIndex(0); return; }
    const interval = setInterval(() => {
      setDetectionMsgIndex(prev => (prev + 1) % DETECTION_MESSAGES.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [hasDetecting]);

  const abortControllersRef = useRef([]);
  const scanStarted = useRef(false);
  const resultsRef = useRef([]);

  // Helper to update a single video's state by index
  const updateVideoState = useCallback((index, updater) => {
    setVideoStates(prev => {
      const next = [...prev];
      next[index] = typeof updater === 'function' ? updater(next[index]) : { ...next[index], ...updater };
      return next;
    });
  }, []);

  // Process a single video: detect type then scan
  const processVideo = useCallback(async (file, index, settingsObj) => {
    const controller = new AbortController();
    abortControllersRef.current[index] = controller;

    let finalSettings = { ...settingsObj };

    // Phase 1: Detect video type (skip in debug mode where user sets scanMode)
    if (!isDebugMode) {
      updateVideoState(index, { status: 'detecting' });
      try {
        const result = await detectVideoType(file);
        finalSettings = { ...finalSettings, scanMode: result.detectedMode };
        updateVideoState(index, (prev) => ({
          ...prev,
          detectedMode: result.detectedMode,
        }));
      } catch {
        // Fall back to 'all' mode
        finalSettings = { ...finalSettings, scanMode: 'all' };
      }
    } else {
      updateVideoState(index, (prev) => ({
        ...prev,
        detectedMode: settingsObj.scanMode || 'all',
      }));
    }

    // Phase 2: Scan
    updateVideoState(index, { status: 'scanning' });

    const onProgress = (p) => {
      updateVideoState(index, (prev) => ({
        ...prev,
        progress: p,
      }));
    };

    const onMatch = ({ items }) => {
      // Update per-video recent items and counts
      updateVideoState(index, (prev) => {
        const updated = [...items.map(i => ({ ...i, time: Date.now(), videoIndex: index })), ...prev.recentItems];
        const nextCounts = { ...prev.foundCounts };
        for (const item of items) {
          if (nextCounts[item.type] !== undefined) nextCounts[item.type]++;
        }
        return { ...prev, recentItems: updated.slice(0, 30), foundCounts: nextCounts };
      });
      // Update combined feed
      setCombinedRecent(prev => {
        const newItems = items.map(i => ({ ...i, time: Date.now(), videoName: file.name }));
        return [...newItems, ...prev].slice(0, 50);
      });
    };

    try {
      const results = await scanVideo(file, finalSettings, onProgress, onMatch, controller.signal);
      resultsRef.current[index] = results;
      updateVideoState(index, { status: 'complete', result: results });
      return results;
    } catch (err) {
      if (err.name === 'AbortError') {
        updateVideoState(index, { status: 'error', error: 'Cancelled' });
      } else {
        console.error('Scan error for', file.name, err);
        updateVideoState(index, {
          status: 'error',
          error: err.message,
          progress: { phase: 'error', current: 0, total: 0, percent: 0, message: 'Error: ' + err.message, currentFrame: null },
        });
      }
      return null;
    }
  }, [updateVideoState]);

  // Run all videos with concurrency limit
  useEffect(() => {
    if (scanStarted.current) return;
    scanStarted.current = true;

    const queue = videoFiles.map((file, i) => ({ file, index: i }));
    let running = 0;
    let queuePos = 0;
    let completedCount = 0;
    const totalCount = videoFiles.length;

    const tryNext = () => {
      while (running < MAX_CONCURRENT && queuePos < queue.length) {
        const { file, index } = queue[queuePos++];
        running++;
        processVideo(file, index, settings).then(() => {
          running--;
          completedCount++;
          if (completedCount === totalCount) {
            // All done - merge results
            let merged = null;
            for (const r of resultsRef.current) {
              if (r) {
                merged = merged ? mergeResults(merged, r) : r;
              }
            }
            if (merged) {
              onScanComplete(merged);
            }
          } else {
            tryNext();
          }
        });
      }
    };

    tryNext();

    return () => {
      // Cleanup: abort all
      abortControllersRef.current.forEach(c => c?.abort());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = () => {
    abortControllersRef.current.forEach(c => c?.abort());
    onCancel();
  };

  // Aggregate stats
  const aggregateCounts = videoStates.reduce(
    (acc, v) => {
      acc.pokemon += v.foundCounts.pokemon;
      acc.item += v.foundCounts.item;
      acc.habitat += v.foundCounts.habitat;
      acc.recipe += v.foundCounts.recipe;
      return acc;
    },
    { pokemon: 0, item: 0, habitat: 0, recipe: 0 }
  );
  const totalFound = Object.values(aggregateCounts).reduce((a, b) => a + b, 0);

  const completedVideos = videoStates.filter(v => v.status === 'complete').length;
  const errorVideos = videoStates.filter(v => v.status === 'error').length;
  const allDone = completedVideos + errorVideos === videoFiles.length;
  const anyScanning = videoStates.some(v => v.status === 'scanning' || v.status === 'detecting');

  // Overall progress: average of all video progresses
  const overallPercent = videoStates.length > 0
    ? Math.round(videoStates.reduce((sum, v) => {
        if (v.status === 'complete') return sum + 100;
        if (v.status === 'error') return sum + 100;
        if (v.status === 'queued') return sum;
        return sum + (v.progress.percent || 0);
      }, 0) / videoStates.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {allDone ? '✅ All Scans Complete' :
           '🔍 Scanning ' + videoFiles.length + ' video' + (videoFiles.length > 1 ? 's' : '') + '...'}
        </h2>
        <button className="btn btn-outline btn-sm" onClick={handleCancel}>
          {allDone ? 'Back' : 'Cancel All'}
        </button>
      </div>

      {/* Overall Progress */}
      <div className="space-y-1">
        <ProgressBar
          value={overallPercent}
          max={100}
          label={allDone
            ? 'All videos processed — ' + totalFound + ' items found'
            : completedVideos + '/' + videoFiles.length + ' videos complete — ' + totalFound + ' items found'
          }
          size="lg"
        />
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(TYPE_LABELS).map(([type, { label, icon }]) => (
          <div key={type} className="flex items-center gap-2 bg-base-200 rounded-lg px-3 py-2">
            <span className="text-lg">{icon}</span>
            <span className="text-xs text-base-content/60 flex-1">{label}</span>
            <span className="font-bold text-sm">{aggregateCounts[type]}</span>
          </div>
        ))}
      </div>

      {/* Per-Video Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-base-content/60">Video Queue</h3>
        {videoStates.map((vs, i) => {
          const badge = STATUS_BADGE[vs.status] || STATUS_BADGE.queued;
          const videoFound = Object.values(vs.foundCounts).reduce((a, b) => a + b, 0);
          return (
            <div key={vs.file.name + vs.file.size + i} className="card bg-base-200">
              <div className="card-body p-3">
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className="text-2xl">
                    {vs.status === 'detecting' ? '🔍' :
                     vs.status === 'scanning' ? '⏳' :
                     vs.status === 'complete' ? '✅' :
                     vs.status === 'error' ? '❌' : '📋'}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{vs.file.name}</span>
                      <span className={'badge badge-xs ' + badge.cls}>{badge.text}</span>
                      {vs.detectedMode && (
                        <span className="badge badge-xs badge-outline">
                          {modeEmoji(vs.detectedMode)} {SCAN_MODES[vs.detectedMode]?.label || vs.detectedMode}
                        </span>
                      )}
                    </div>

                    {/* Per-video progress bar */}
                    {(vs.status === 'scanning' || vs.status === 'detecting') && (
                      <div className="mt-1">
                        <progress
                          className="progress progress-primary w-full h-1.5"
                          value={vs.status === 'detecting' ? undefined : (vs.progress.percent || 0)}
                          max="100"
                        />
                        {vs.status === 'detecting' && (
                          <p className="text-xs text-info mt-0.5 transition-opacity duration-300">
                            {DETECTION_MESSAGES[detectionMsgIndex]}
                          </p>
                        )}
                        {vs.status === 'scanning' && vs.progress.message && (
                          <p className="text-xs text-base-content/50 mt-0.5 truncate">{vs.progress.message}</p>
                        )}
                      </div>
                    )}

                    {vs.status === 'error' && vs.error && (
                      <p className="text-xs text-error mt-1">{vs.error}</p>
                    )}
                  </div>

                  {/* Found count */}
                  <div className="text-right">
                    <span className="font-bold text-lg">{videoFound}</span>
                    <span className="text-xs text-base-content/50 block">found</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Body: Preview + Combined Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Frame Previews */}
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Active Frames</h3>
            <div className="space-y-2">
              {videoStates.filter(v => v.status === 'scanning' && v.progress.currentFrame).length === 0 ? (
                <div className="aspect-video bg-base-300 rounded-lg flex items-center justify-center">
                  <span className="text-base-content/40 text-sm">
                    {anyScanning ? 'Waiting for first frame...' : allDone ? 'Scanning complete' : 'Starting...'}
                  </span>
                </div>
              ) : (
                videoStates
                  .filter(v => v.status === 'scanning' && v.progress.currentFrame)
                  .slice(0, MAX_CONCURRENT)
                  .map((vs, i) => (
                    <div key={vs.file.name + i}>
                      <p className="text-xs text-base-content/50 mb-1 truncate">{vs.file.name}</p>
                      <div className="aspect-video bg-base-300 rounded-lg overflow-hidden">
                        <img
                          src={vs.progress.currentFrame}
                          alt={'Frame from ' + vs.file.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Combined Recent Detections */}
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Recent Detections ({totalFound})</h3>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {combinedRecent.length === 0 ? (
                <p className="text-xs text-base-content/40 italic">No items detected yet...</p>
              ) : (
                combinedRecent.slice(0, 30).map((item, i) => (
                  <div key={item.name + '-' + i} className="flex items-center gap-2 text-xs bg-base-300/50 rounded px-2 py-1">
                    <span>{TYPE_LABELS[item.type]?.icon || '📦'}</span>
                    <span className="flex-1 truncate font-medium">{item.name}</span>
                    <span className="badge badge-ghost badge-xs">{item.type}</span>
                    {videoFiles.length > 1 && (
                      <span className="text-base-content/30 truncate max-w-20" title={item.videoName}>
                        {item.videoName}
                      </span>
                    )}
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
