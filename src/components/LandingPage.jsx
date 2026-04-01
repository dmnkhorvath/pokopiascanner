import { useState, useRef, useEffect } from 'react';
import { DEFAULT_SETTINGS, CROP_PRESETS, SCAN_MODES, detectVideoFPS } from '../utils/ocrEngine.js';
import { detectVideoType } from '../utils/videoDetector.js';
import './LandingPage.css';

// Check for debug mode via URL query parameter
const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

export default function LandingPage({ onStartScan, onImportResults, onShowHowTo, existingResults, scanCount = 0, onStartFresh, onViewResults }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [detectedFPS, setDetectedFPS] = useState(null);
  const [detectingFPS, setDetectingFPS] = useState(false);
  const [detectingType, setDetectingType] = useState(false);
  const [detectedType, setDetectedType] = useState(null);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  // Fun rotating messages during detection
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
  const [detectionMsgIndex, setDetectionMsgIndex] = useState(0);
  useEffect(() => {
    if (!detectingType) {
      setDetectionMsgIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setDetectionMsgIndex(prev => (prev + 1) % DETECTION_MESSAGES.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [detectingType]);

  const handleFileSelect = async (file) => {
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setDetectedFPS(null);
      setDetectedType(null);

      // Auto-detect FPS only in debug mode (normal users can't see FPS settings,
      // and scanVideo handles FPS detection internally)
      if (isDebugMode && settings.autoDetectFPS) {
        setDetectingFPS(true);
        try {
          const fpsInfo = await detectVideoFPS(file);
          setDetectedFPS(fpsInfo);
        } catch {
          setDetectedFPS({ fps: 30, frameIntervalMs: 33, detected: false });
        } finally {
          setDetectingFPS(false);
        }
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateCustomCrop = (key, value) => {
    setSettings(prev => ({
      ...prev,
      customCrop: { ...prev.customCrop, [key]: Number(value) }
    }));
  };

  const handleStartScan = async () => {
    if (!videoFile) return;

    // In debug mode, user has manually set scanMode — skip auto-detection
    if (isDebugMode) {
      onStartScan(videoFile, settings);
      return;
    }

    // Auto-detect video type
    setDetectingType(true);
    setDetectedType(null);
    try {
      const result = await detectVideoType(videoFile);
      setDetectedType(result);
      // Use detected mode in settings
      const finalSettings = { ...settings, scanMode: result.detectedMode };
      // Brief delay so user can see what was detected
      await new Promise(r => setTimeout(r, 600));
      onStartScan(videoFile, finalSettings);
    } catch {
      // Detection failed — fall back to 'all' mode
      onStartScan(videoFile, { ...settings, scanMode: 'all' });
    } finally {
      setDetectingType(false);
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
        alert('Invalid JSON file. Please select a valid scan export.');
      }
    };
    reader.readAsText(file);
  };

  const modeEmoji = (mode) => {
    switch (mode) {
      case 'habitat': return '🏡';
      case 'pokemon': return '🐾';
      case 'item': return '🎒';
      case 'recipe': return '🍳';
      default: return '📦';
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="hero py-10">
        <div className="hero-content text-center">
          <div className="max-w-lg">
            <div className="text-6xl mb-4">{"🔍"}</div>
            <h1 className="text-4xl sm:text-5xl font-bold">Pokopia Progress Scanner</h1>
            <p className="py-4 text-base-content/60">
              {existingResults
              ? 'Upload another video to add more entries to your current session.'
              : 'Upload a Nintendo Switch video recording of your Pokémon Pokopia game to scan and track your collection progress.'
            }
            </p>
          </div>
        </div>
      </div>

      {/* Existing Results Banner */}
      {existingResults && scanCount > 0 && (
        <div className="alert alert-success shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
            <div className="flex-1">
              <h3 className="font-bold">📊 Session in progress</h3>
              <p className="text-sm opacity-80">
                You have {existingResults.totalFound} items from {scanCount} video{scanCount > 1 ? 's' : ''}.
                Upload another video to merge more results.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-primary" onClick={onViewResults}>
                View Results
              </button>
              <button className="btn btn-sm btn-ghost" onClick={onStartFresh}>
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <section>
        <h2 className="text-xl font-bold mb-3">{"📹"} Upload Video</h2>
        <div
          className={`card border-2 border-dashed cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary bg-primary/10'
              : videoFile
                ? 'border-success/50 bg-base-200'
                : 'border-base-content/20 bg-base-200 hover:border-primary/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="card-body items-center text-center py-8">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              hidden
            />
            {videoFile ? (
              <div className="flex flex-col items-center gap-3 w-full">
                <video src={videoPreview} className="rounded-lg max-h-48 w-auto" muted />
                <div className="text-center">
                  <p className="font-medium text-sm">{videoFile.name}</p>
                  <p className="text-xs text-base-content/50">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Change file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">{"⬆️"}</span>
                <p className="font-medium">Drag & drop your video here</p>
                <p className="text-sm text-base-content/50">or click to browse</p>
                <p className="text-xs text-base-content/40">Supports MP4, MOV, WebM, AVI</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Settings Section - only visible in debug mode */}
      {isDebugMode && (
        <section>
          <h2 className="text-xl font-bold mb-3">{"⚙️"} Scanner Settings <span className="badge badge-warning badge-sm">Debug</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Scan Mode - full width */}
            <div className="sm:col-span-2 bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">Scan Mode</span>
                <span className="block text-xs text-base-content/50">Choose what to scan from your video</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(SCAN_MODES).map(([key, mode]) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${
                      settings.scanMode === key ? 'btn-primary' : 'btn-ghost bg-base-300'
                    }`}
                    onClick={() => updateSetting('scanMode', key)}
                    title={mode.description}
                  >
                    {key === 'all' ? '📦' :
                     key === 'habitat' ? '🏡' :
                     key === 'pokemon' ? '🐾' :
                     key === 'item' ? '🎒' : '🍳'} {mode.label}
                  </button>
                ))}
              </div>
              {settings.scanMode === 'habitat' && (
                <p className="text-xs text-info mt-2">🏡 Habitat mode scans the upper banner for "No. XXX" + name, and detects built status from the bottom text.</p>
              )}
              {settings.scanMode === 'pokemon' && (
                <p className="text-xs text-info mt-2">🔴 Pokémon mode scans the banner for "No. XXX" and detects captured vs sensed status. Works with all banner colors.</p>
              )}
              {settings.scanMode === 'item' && (
                <p className="text-xs text-info mt-2">🎒 Item mode uses grid detection to identify discovered vs undiscovered items. Record a video scrolling through your item collection grid.</p>
              )}
              {settings.scanMode === 'recipe' && (
                <p className="text-xs text-info mt-2">📋 Recipe mode uses grid detection to identify discovered vs undiscovered recipes. Record a video scrolling through your recipe collection grid.</p>
              )}
            </div>

            {/* Frame Rate - full width */}
            <div className="sm:col-span-2 bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">Frame Rate</span>
                <span className="block text-xs text-base-content/50">How frames are extracted from the video</span>
              </label>
              <div className="flex gap-2 mt-2">
                <button
                  className={`btn btn-sm ${settings.autoDetectFPS ? 'btn-primary' : 'btn-ghost bg-base-300'}`}
                  onClick={() => {
                    updateSetting('autoDetectFPS', true);
                    updateSetting('frameIntervalMs', 0);
                    if (videoFile && !detectedFPS) {
                      setDetectingFPS(true);
                      detectVideoFPS(videoFile)
                        .then(info => setDetectedFPS(info))
                        .catch(() => setDetectedFPS({ fps: 30, frameIntervalMs: 33, detected: false }))
                        .finally(() => setDetectingFPS(false));
                    }
                  }}
                >
                  🎬 Auto-detect FPS
                </button>
                <button
                  className={`btn btn-sm ${!settings.autoDetectFPS ? 'btn-primary' : 'btn-ghost bg-base-300'}`}
                  onClick={() => {
                    updateSetting('autoDetectFPS', false);
                    updateSetting('frameIntervalMs', detectedFPS?.frameIntervalMs || 33);
                  }}
                >
                  ✏️ Manual
                </button>
              </div>
              {settings.autoDetectFPS && (
                <div className="mt-2 text-xs">
                  {detectingFPS ? (
                    <span className="text-warning">⏳ Detecting video framerate...</span>
                  ) : detectedFPS ? (
                    <span className={detectedFPS.detected ? 'text-success' : 'text-warning'}>
                      {detectedFPS.detected
                        ? `✅ Detected: ${detectedFPS.fps} FPS (${detectedFPS.frameIntervalMs}ms per frame)`
                        : `⚠️ Browser doesn't support detection — will use ${detectedFPS.fps} FPS fallback`}
                    </span>
                  ) : (
                    <span className="text-base-content/50">📎 Upload a video to detect its framerate</span>
                  )}
                </div>
              )}
              {!settings.autoDetectFPS && (
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={settings.frameIntervalMs || 33}
                    onChange={(e) => updateSetting('frameIntervalMs', Number(e.target.value))}
                    step="10"
                    className="range range-primary range-xs flex-1"
                  />
                  <span className="text-xs font-mono whitespace-nowrap">
                    {settings.frameIntervalMs || 33}ms ({Math.round(1000 / (settings.frameIntervalMs || 33))} FPS)
                  </span>
                </div>
              )}
            </div>

            {/* Processing Delay */}
            <div className="bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">Processing Delay</span>
                <span className="block text-xs text-base-content/50">Delay between frames (ms)</span>
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="10"
                  value={settings.processingDelay}
                  onChange={(e) => updateSetting('processingDelay', Number(e.target.value))}
                  className="range range-primary range-xs flex-1"
                />
                <span className="text-xs font-mono w-12 text-right">{settings.processingDelay}ms</span>
              </div>
            </div>

            {/* OCR Confidence */}
            <div className="bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">OCR Confidence Threshold</span>
                <span className="block text-xs text-base-content/50">Minimum confidence to accept text</span>
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.confidenceThreshold}
                  onChange={(e) => updateSetting('confidenceThreshold', Number(e.target.value))}
                  className="range range-primary range-xs flex-1"
                />
                <span className="text-xs font-mono w-10 text-right">{settings.confidenceThreshold}%</span>
              </div>
            </div>

            {/* Fuzzy Tolerance */}
            <div className="bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">Fuzzy Match Tolerance</span>
                <span className="block text-xs text-base-content/50">Max character distance for matching</span>
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={settings.fuzzyTolerance}
                  onChange={(e) => updateSetting('fuzzyTolerance', Number(e.target.value))}
                  className="range range-primary range-xs flex-1"
                />
                <span className="text-xs font-mono w-6 text-right">{settings.fuzzyTolerance}</span>
              </div>
            </div>

            {/* Crop Region - full width */}
            <div className="sm:col-span-2 bg-base-200 rounded-lg p-4">
              <label className="block mb-1">
                <span className="font-medium text-sm">Crop Region</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(CROP_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${
                      settings.cropPreset === key ? 'btn-primary' : 'btn-ghost bg-base-300'
                    }`}
                    onClick={() => updateSetting('cropPreset', key)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Crop Sliders */}
            {settings.cropPreset === 'custom' && (
              <div className="sm:col-span-2 bg-base-200 rounded-lg p-4">
                <label className="block mb-2">
                  <span className="font-medium text-sm">Custom Crop Region (%)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['x', 'y', 'w', 'h'].map((dim) => (
                    <div key={dim} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-6">{dim.toUpperCase()}: {settings.customCrop[dim]}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.customCrop[dim]}
                        onChange={(e) => updateCustomCrop(dim, e.target.value)}
                        className="range range-xs flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Detection Result Banner */}
      {detectingType && (
        <div className="alert alert-info shadow-md">
          <span className="loading loading-spinner loading-sm"></span>
          <span className="transition-opacity duration-300">{DETECTION_MESSAGES[detectionMsgIndex]}</span>
        </div>
      )}
      {detectedType && !detectingType && (
        <div className="alert alert-info shadow-md">
          <span>{modeEmoji(detectedType.detectedMode)} Detected: <strong>{SCAN_MODES[detectedType.detectedMode]?.label || detectedType.detectedMode}</strong></span>
          <span className="text-xs opacity-70">({detectedType.confidence} confidence{detectedType.detectedAt ? `, at ${detectedType.detectedAt}` : ''})</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          className="btn btn-primary btn-lg gap-2"
          onClick={handleStartScan}
          disabled={!videoFile || detectingType}
        >
          {detectingType ? (
            <><span className="loading loading-spinner loading-sm"></span> {DETECTION_MESSAGES[detectionMsgIndex]}</>
          ) : existingResults ? '➕ Scan & Merge' : '🔍 Start Scanning'}
        </button>
        <button
          className="btn btn-secondary gap-2"
          onClick={() => importInputRef.current?.click()}
        >
          {"📥"} Import Previous Scan
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          hidden
        />
      </div>

      {/* How To Guide Teaser */}
      <section>
        <div className="card bg-base-200">
          <div className="card-body flex-row items-center gap-4">
            <span className="text-4xl">{"📖"}</span>
            <div className="flex-1">
              <h2 className="card-title text-base">New here? Learn how to scan in 5 easy steps</h2>
              <p className="text-sm text-base-content/60">
                Record a video on your Nintendo Switch, transfer it to your device, and let the scanner do the rest.
              </p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={onShowHowTo}>
              {"👉"} How to Use
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
