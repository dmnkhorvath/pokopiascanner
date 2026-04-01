import { useState, useRef, useEffect } from 'react';
import { DEFAULT_SETTINGS, CROP_PRESETS, SCAN_MODES, detectVideoFPS } from '../utils/ocrEngine.js';
import './LandingPage.css';

// Check for debug mode via URL query parameter
const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';

export default function LandingPage({ onStartScan, onImportResults, onShowHowTo, existingResults, scanCount = 0, onStartFresh, onViewResults }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [videoFiles, setVideoFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [detectedFPS, setDetectedFPS] = useState(null);
  const [detectingFPS, setDetectingFPS] = useState(false);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  const addFiles = (newFiles) => {
    const validFiles = Array.from(newFiles).filter(f => f.type.startsWith('video/'));
    if (validFiles.length === 0) return;
    setVideoFiles(prev => {
      // Deduplicate by name+size+lastModified
      const existing = new Set(prev.map(f => f.name + f.size + f.lastModified));
      const unique = validFiles.filter(f => !existing.has(f.name + f.size + f.lastModified));
      return [...prev, ...unique];
    });
  };

  const removeFile = (index) => {
    setVideoFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
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

  const handleStartScan = () => {
    if (videoFiles.length === 0) return;
    // Pass array of files + settings; detection happens in VideoScanner
    onStartScan(videoFiles, settings);
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

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
              ? 'Upload more videos to add entries to your current session.'
              : 'Upload Nintendo Switch video recordings of your Pokémon Pokopia game to scan and track your collection progress.'
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
                You have {existingResults.totalFound} items from {scanCount} scan{scanCount > 1 ? 's' : ''}.
                Upload more videos to merge additional results.
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
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xl font-bold">{"📹"} Upload Videos</h2>
          {videoFiles.length > 0 && (
            <span className="badge badge-primary">{videoFiles.length} video{videoFiles.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div
          className={`card border-2 border-dashed cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary bg-primary/10'
              : videoFiles.length > 0
                ? 'border-success/50 bg-base-200'
                : 'border-base-content/20 bg-base-200 hover:border-primary/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="card-body items-center text-center py-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              hidden
            />
            {videoFiles.length > 0 ? (
              <div className="w-full" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {videoFiles.map((file, i) => (
                    <div key={file.name + file.size + i} className="flex items-center gap-3 bg-base-300 rounded-lg px-3 py-2">
                      <span className="text-lg">{"🎬"}</span>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium text-sm truncate">{file.name}</p>
                        <p className="text-xs text-base-content/50">{formatSize(file.size)}</p>
                      </div>
                      <button
                        className="btn btn-ghost btn-xs btn-circle text-error"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-ghost btn-sm mt-3 gap-1"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  ➕ Add more videos
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-4xl">{"⬆️"}</span>
                <p className="font-medium">Drag & drop your videos here</p>
                <p className="text-sm text-base-content/50">or click to browse — select multiple files</p>
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
                <>
                  <p className="text-xs text-info mt-2">🎒 Item mode uses grid detection to identify discovered vs undiscovered items. Record a video scrolling through your item collection grid.</p>
                  <p className="text-xs text-warning mt-1">⚠️ Some items share identical icons and cannot be distinguished by the scanner.</p>
                </>
              )}
              {settings.scanMode === 'recipe' && (
                <>
                  <p className="text-xs text-info mt-2">📋 Recipe mode uses grid detection to identify discovered vs undiscovered recipes. Record a video scrolling through your recipe collection grid.</p>
                  <p className="text-xs text-warning mt-1">⚠️ Some recipes share identical icons and cannot be distinguished by the scanner.</p>
                </>
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
                  <span className="text-base-content/50">📎 FPS will be auto-detected per video during scanning</span>
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

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          className="btn btn-primary btn-lg gap-2"
          onClick={handleStartScan}
          disabled={videoFiles.length === 0}
        >
          {existingResults
            ? `➕ Scan & Merge (${videoFiles.length} video${videoFiles.length !== 1 ? 's' : ''})`
            : `🔍 Start Scanning (${videoFiles.length} video${videoFiles.length !== 1 ? 's' : ''})`
          }
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

      {/* How It Works - Inline Guide */}
      <section>
        <h2 className="text-2xl font-bold text-center mb-6">{"📖"} How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Step 1: Record */}
          <div className="card bg-base-200 shadow-md">
            <figure className="px-4 pt-4">
              <img
                src={`${import.meta.env.BASE_URL}howto/habitat-scroll.gif`}
                alt="Scrolling through the Habitat Dex list on Nintendo Switch"
                className="rounded-lg w-full"
              />
            </figure>
            <div className="card-body pt-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="badge badge-primary font-bold">1</div>
                <h3 className="card-title text-base">{"🎮"} Record</h3>
              </div>
              <p className="text-sm text-base-content/70">
                Open the collection you want to scan and scroll through it. For habitats, the simple list/grid scroll works too. Hold the <strong>Capture button</strong> to save the last 30s, and press every ~25s for longer lists.
              </p>
            </div>
          </div>

          {/* Step 2: Transfer */}
          <div className="card bg-base-200 shadow-md">
            <figure className="px-4 pt-4">
              <img
                src={`${import.meta.env.BASE_URL}howto/pokemon-scroll.gif`}
                alt="Scrolling through Pokédex on Nintendo Switch"
                className="rounded-lg w-full"
              />
            </figure>
            <div className="card-body pt-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="badge badge-primary font-bold">2</div>
                <h3 className="card-title text-base">{"📲"} Transfer</h3>
              </div>
              <p className="text-sm text-base-content/70">
                Send the video to your phone or PC. Use the Switch’s <strong>Send to Smartphone</strong> (QR code),
                a <strong>USB-C cable</strong>, or copy from a <strong>microSD card</strong>.
              </p>
            </div>
          </div>

          {/* Step 3: Scan */}
          <div className="card bg-base-200 shadow-md">
            <figure className="px-4 pt-4">
              <img
                src={`${import.meta.env.BASE_URL}howto/items-scroll.gif`}
                alt="Scrolling through items grid on Nintendo Switch"
                className="rounded-lg w-full"
              />
            </figure>
            <div className="card-body pt-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="badge badge-primary font-bold">3</div>
                <h3 className="card-title text-base">{"🔍"} Scan</h3>
              </div>
              <p className="text-sm text-base-content/70">
                Drop your videos above and hit <strong>Start Scanning</strong>.
                The scanner auto-detects the category, identifies entries, and deduplicates overlapping clips.
              </p>
            </div>
          </div>

        </div>
        <p className="text-center text-xs text-base-content/40 mt-4">
          Supports Pokédex, Habitats, Items & Recipes • Multiple videos merge automatically •{" "}
          <button className="link link-primary" onClick={onShowHowTo}>Full guide →</button>
        </p>
      </section>
    </div>
  );
}
