import { useState, useCallback, useRef, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import VideoScanner from './components/VideoScanner';
import ScanResults from './components/ScanResults';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsConditions from './components/TermsConditions';
import CookieConsent from './components/CookieConsent';
import { mergeResults } from './utils/ocrEngine.js';
import AdBanner from './components/AdBanner';
import './App.css';

const PAGES = {
  LANDING: 'landing',
  SCANNING: 'scanning',
  RESULTS: 'results',
  PRIVACY: 'privacy',
  TERMS: 'terms',
};

// Map hash routes to pages
const HASH_TO_PAGE = {
  '#/privacy': PAGES.PRIVACY,
  '#/terms': PAGES.TERMS,
};

const PAGE_TO_HASH = {
  [PAGES.PRIVACY]: '#/privacy',
  [PAGES.TERMS]: '#/terms',
};

function getPageFromHash() {
  const hash = window.location.hash;
  return HASH_TO_PAGE[hash] || null;
}

export default function App() {
  const [page, setPage] = useState(() => getPageFromHash() || PAGES.LANDING);
  const [videoFile, setVideoFile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [scanResults, setScanResults] = useState(null);

  const cookieSettingsRef = useRef(null);

  // Sync hash -> page on browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hashPage = getPageFromHash();
      if (hashPage) {
        setPage(hashPage);
      } else if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        setPage(PAGES.LANDING);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Navigate with hash update for routable pages
  const navigateTo = useCallback((targetPage) => {
    setPage(targetPage);
    if (PAGE_TO_HASH[targetPage]) {
      window.location.hash = PAGE_TO_HASH[targetPage];
    } else {
      // Clear hash for non-routable pages (landing, scanning, results)
      if (window.location.hash) {
        history.pushState(null, '', window.location.pathname);
      }
    }
    window.scrollTo(0, 0);
  }, []);

  const handleStartScan = useCallback((file, scanSettings) => {
    setVideoFile(file);
    setSettings(scanSettings);
    navigateTo(PAGES.SCANNING);
  }, [navigateTo]);

  const handleScanComplete = useCallback((results) => {
    if (scanResults) {
      setScanResults(mergeResults(scanResults, results));
    } else {
      setScanResults(results);
    }
    navigateTo(PAGES.RESULTS);
  }, [scanResults, navigateTo]);

  const handleImportResults = useCallback((imported) => {
    if (scanResults) {
      setScanResults(mergeResults(scanResults, imported));
    } else {
      setScanResults(imported);
    }
    navigateTo(PAGES.RESULTS);
  }, [scanResults, navigateTo]);

  const handleNewScan = useCallback(() => {
    setVideoFile(null);
    setSettings(null);
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  const handleCancelScan = useCallback(() => {
    setVideoFile(null);
    setSettings(null);
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  const handleBackToScanner = useCallback(() => {
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  const handleOpenCookieSettings = useCallback(() => {
    if (cookieSettingsRef.current) {
      cookieSettingsRef.current();
    }
  }, []);

  return (
    <div className="app">
      {/* Header - shown on scanning, results, and legal pages */}
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
          <>
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_LANDING_TOP} position="top" />
            <LandingPage
              onStartScan={handleStartScan}
              onImportResults={handleImportResults}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_LANDING_BOTTOM} position="bottom" />
          </>
        )}

        {page === PAGES.SCANNING && videoFile && settings && (
          <>
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_TOP} position="top" />
            <VideoScanner
              videoFile={videoFile}
              settings={settings}
              onScanComplete={handleScanComplete}
              onCancel={handleCancelScan}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_BOTTOM} position="bottom" />
          </>
        )}

        {page === PAGES.RESULTS && (
          <>
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_TOP} position="top" />
            <ScanResults
              results={scanResults}
              onNewScan={handleNewScan}
              onImportResults={handleImportResults}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_BOTTOM} position="bottom" />
          </>
        )}

        {page === PAGES.PRIVACY && (
          <PrivacyPolicy onBack={handleBackToScanner} />
        )}

        {page === PAGES.TERMS && (
          <TermsConditions onBack={handleBackToScanner} />
        )}
      </main>

      {/* Footer */}
      <footer className="app__footer">
        <p>Pokopia Progress Scanner &mdash; Track your Pok\u00e9mon Pokopia collection</p>
        <nav className="app__footer-links">
          <button className="app__footer-link" onClick={() => navigateTo(PAGES.PRIVACY)}>Privacy Policy</button>
          <span className="app__footer-sep">|</span>
          <button className="app__footer-link" onClick={() => navigateTo(PAGES.TERMS)}>Terms &amp; Conditions</button>
          <span className="app__footer-sep">|</span>
          <button className="app__footer-link" onClick={handleOpenCookieSettings}>Cookie Settings</button>
        </nav>
      </footer>

      {/* Cookie Consent Banner */}
      <CookieConsent onOpenSettings={cookieSettingsRef} />
    </div>
  );
}
