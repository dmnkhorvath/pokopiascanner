import { useState, useRef } from 'react';
import { DEFAULT_SETTINGS, CROP_PRESETS, SCAN_MODES, detectVideoFPS } from '../utils/ocrEngine.js';
import './LandingPage.css';

export default function LandingPage({ onStartScan, onImportResults }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [detectedFPS, setDetectedFPS] = useState(null);
  const [detectingFPS, setDetectingFPS] = useState(false);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setDetectedFPS(null);

      // Auto-detect FPS if enabled
      if (settings.autoDetectFPS) {
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

  const handleStartScan = () => {
    if (videoFile) {
      onStartScan(videoFile, settings);
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

  return (
    <div className="landing">
      <div className="landing__hero">
        <div className="landing__logo">{"\uD83D\uDD0D"}</div>
        <h1 className="landing__title">Pokopia Progress Scanner</h1>
        <p className="landing__subtitle">
          Upload a Nintendo Switch video recording of your Pok\u00e9mon Pokopia game
          to scan and track your collection progress.
        </p>
      </div>

      <div className="landing__content">
        {/* Upload Section */}
        <section className="landing__section">
          <h2 className="section__title">{"\uD83D\uDCF9"} Upload Video</h2>
          <div
            className={`upload-zone ${dragActive ? 'upload-zone--active' : ''} ${videoFile ? 'upload-zone--has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              hidden
            />
            {videoFile ? (
              <div className="upload-zone__preview">
                <video src={videoPreview} className="upload-zone__video" muted />
                <div className="upload-zone__file-info">
                  <span className="upload-zone__filename">{videoFile.name}</span>
                  <span className="upload-zone__filesize">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
                <button
                  className="upload-zone__change"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Change file
                </button>
              </div>
            ) : (
              <div className="upload-zone__placeholder">
                <span className="upload-zone__icon">{"\u2B06\uFE0F"}</span>
                <p>Drag & drop your video here</p>
                <p className="upload-zone__hint">or click to browse</p>
                <p className="upload-zone__formats">Supports MP4, MOV, WebM, AVI</p>
              </div>
            )}
          </div>
        </section>

        {/* Settings Section */}
        <section className="landing__section">
          <h2 className="section__title">{"\u2699\uFE0F"} Scanner Settings</h2>
          <div className="settings-grid">
            <div className="setting setting--full">
              <label className="setting__label">
                Scan Mode
                <span className="setting__hint">Choose what to scan from your video</span>
              </label>
              <div className="setting__toggle-row setting__scan-modes">
                {Object.entries(SCAN_MODES).map(([key, mode]) => (
                  <button
                    key={key}
                    className={`setting__preset-btn ${settings.scanMode === key ? 'setting__preset-btn--active' : ''}`}
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
                <div className="setting__fps-info">
                  <span className="setting__fps-hint">🏡 Habitat mode scans the upper banner for "No. XXX" + name, and detects built status from the bottom text.</span>
                </div>
              )}
              {settings.scanMode === 'pokemon' && (
                <div className="setting__fps-info">
                  <span className="setting__fps-hint">🔴 Pokémon mode scans the banner for "No. XXX" and detects captured vs sensed status. Works with all banner colors.</span>
                </div>
              )}
            </div>

            <div className="setting setting--full">
              <label className="setting__label">
                Frame Rate
                <span className="setting__hint">How frames are extracted from the video</span>
              </label>
              <div className="setting__toggle-row">
                <button
                  className={`setting__preset-btn ${settings.autoDetectFPS ? 'setting__preset-btn--active' : ''}`}
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
                  className={`setting__preset-btn ${!settings.autoDetectFPS ? 'setting__preset-btn--active' : ''}`}
                  onClick={() => {
                    updateSetting('autoDetectFPS', false);
                    updateSetting('frameIntervalMs', detectedFPS?.frameIntervalMs || 33);
                  }}
                >
                  ✏️ Manual
                </button>
              </div>
              {settings.autoDetectFPS && (
                <div className="setting__fps-info">
                  {detectingFPS ? (
                    <span className="setting__fps-detecting">⏳ Detecting video framerate...</span>
                  ) : detectedFPS ? (
                    <span className={`setting__fps-result ${detectedFPS.detected ? 'setting__fps-result--ok' : 'setting__fps-result--fallback'}`}>
                      {detectedFPS.detected
                        ? `✅ Detected: ${detectedFPS.fps} FPS (${detectedFPS.frameIntervalMs}ms per frame)`
                        : `⚠️ Browser doesn’t support detection — will use ${detectedFPS.fps} FPS fallback`}
                    </span>
                  ) : (
                    <span className="setting__fps-hint">📎 Upload a video to detect its framerate</span>
                  )}
                </div>
              )}
              {!settings.autoDetectFPS && (
                <div className="setting__manual-fps">
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={settings.frameIntervalMs || 33}
                    onChange={(e) => updateSetting('frameIntervalMs', Number(e.target.value))}
                    step="10"
                    className="setting__range"
                  />
                  <span className="setting__value">
                    {settings.frameIntervalMs || 33}ms ({Math.round(1000 / (settings.frameIntervalMs || 33))} FPS)
                  </span>
                </div>
              )}
            </div>

            <div className="setting">
              <label className="setting__label">
                Processing Delay
                <span className="setting__hint">Delay between frames (ms)</span>
              </label>
              <input
                type="range"
                min="0"
                max="200"
                step="10"
                value={settings.processingDelay}
                onChange={(e) => updateSetting('processingDelay', Number(e.target.value))}
                className="setting__range"
              />
              <span className="setting__value">{settings.processingDelay}ms</span>
            </div>

            <div className="setting">
              <label className="setting__label">
                OCR Confidence Threshold
                <span className="setting__hint">Minimum confidence to accept text</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.confidenceThreshold}
                onChange={(e) => updateSetting('confidenceThreshold', Number(e.target.value))}
                className="setting__range"
              />
              <span className="setting__value">{settings.confidenceThreshold}%</span>
            </div>

            <div className="setting">
              <label className="setting__label">
                Fuzzy Match Tolerance
                <span className="setting__hint">Max character distance for matching</span>
              </label>
              <input
                type="range"
                min="0"
                max="5"
                value={settings.fuzzyTolerance}
                onChange={(e) => updateSetting('fuzzyTolerance', Number(e.target.value))}
                className="setting__range"
              />
              <span className="setting__value">{settings.fuzzyTolerance}</span>
            </div>

            <div className="setting setting--full">
              <label className="setting__label">Crop Region</label>
              <div className="setting__select-group">
                {Object.entries(CROP_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`setting__preset-btn ${settings.cropPreset === key ? 'setting__preset-btn--active' : ''}`}
                    onClick={() => updateSetting('cropPreset', key)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {settings.cropPreset === 'custom' && (
              <div className="setting setting--full">
                <label className="setting__label">Custom Crop Region (%)</label>
                <div className="crop-sliders">
                  {['x', 'y', 'w', 'h'].map((dim) => (
                    <div key={dim} className="crop-slider">
                      <label>{dim.toUpperCase()}: {settings.customCrop[dim]}%</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.customCrop[dim]}
                        onChange={(e) => updateCustomCrop(dim, e.target.value)}
                        className="setting__range"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="landing__actions">
          <button
            className="btn btn--primary btn--lg"
            onClick={handleStartScan}
            disabled={!videoFile}
          >
            {"\uD83D\uDD0D"} Start Scanning
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => importInputRef.current?.click()}
          >
            {"\uD83D\uDCE5"} Import Previous Scan
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            hidden
          />
        </div>

        {/* Instructions */}
        <section className="landing__section landing__instructions">
          <h2 className="section__title">{"\uD83D\uDCD6"} How It Works</h2>
          <div className="instructions-grid">
            <div className="instruction">
              <span className="instruction__number">1</span>
              <h3>Record Your Screen</h3>
              <p>Use the Nintendo Switch capture button to record a video while scrolling through your Pokopia inventory, Pok\u00e9dex, habitats, or recipe list.</p>
            </div>
            <div className="instruction">
              <span className="instruction__number">2</span>
              <h3>Upload the Video</h3>
              <p>Transfer the video to your device and upload it here. Supports MP4, MOV, WebM, and other common formats.</p>
            </div>
            <div className="instruction">
              <span className="instruction__number">3</span>
              <h3>Scan & Detect</h3>
              <p>The scanner extracts frames, processes them with OCR, and matches detected text against the complete Pokopia database.</p>
            </div>
            <div className="instruction">
              <span className="instruction__number">4</span>
              <h3>Track Progress</h3>
              <p>View your collection progress across all categories. Export results as JSON to save or share your progress.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
