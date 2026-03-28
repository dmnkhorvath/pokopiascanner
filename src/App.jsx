import { useState, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import VideoScanner from './components/VideoScanner';
import ScanResults from './components/ScanResults';
import { mergeResults } from './utils/ocrEngine.js';
import './App.css';

const PAGES = {
  LANDING: 'landing',
  SCANNING: 'scanning',
  RESULTS: 'results',
};

export default function App() {
  const [page, setPage] = useState(PAGES.LANDING);
  const [videoFile, setVideoFile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [scanResults, setScanResults] = useState(null);

  const handleStartScan = useCallback((file, scanSettings) => {
    setVideoFile(file);
    setSettings(scanSettings);
    setPage(PAGES.SCANNING);
  }, []);

  const handleScanComplete = useCallback((results) => {
    if (scanResults) {
      // Merge with existing results
      setScanResults(mergeResults(scanResults, results));
    } else {
      setScanResults(results);
    }
    setPage(PAGES.RESULTS);
  }, [scanResults]);

  const handleImportResults = useCallback((imported) => {
    if (scanResults) {
      setScanResults(mergeResults(scanResults, imported));
    } else {
      setScanResults(imported);
    }
    setPage(PAGES.RESULTS);
  }, [scanResults]);

  const handleNewScan = useCallback(() => {
    setVideoFile(null);
    setSettings(null);
    setPage(PAGES.LANDING);
  }, []);

  const handleCancelScan = useCallback(() => {
    setVideoFile(null);
    setSettings(null);
    setPage(PAGES.LANDING);
  }, []);

  return (
    <div className="app">
      {/* Header - shown on scanning and results pages */}
      {page !== PAGES.LANDING && (
        <header className="app__header">
          <div className="app__header-inner">
            <button className="app__logo-btn" onClick={handleNewScan}>
              <span className="app__logo-icon">{"\uD83D\uDD0D"}</span>
              <span className="app__logo-text">Pokopia Scanner</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="app__main">
        {page === PAGES.LANDING && (
          <LandingPage
            onStartScan={handleStartScan}
            onImportResults={handleImportResults}
          />
        )}

        {page === PAGES.SCANNING && videoFile && settings && (
          <VideoScanner
            videoFile={videoFile}
            settings={settings}
            onScanComplete={handleScanComplete}
            onCancel={handleCancelScan}
          />
        )}

        {page === PAGES.RESULTS && (
          <ScanResults
            results={scanResults}
            onNewScan={handleNewScan}
            onImportResults={handleImportResults}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="app__footer">
        <p>Pokopia Progress Scanner &mdash; Track your Pok\u00e9mon Pokopia collection</p>
      </footer>
    </div>
  );
}
