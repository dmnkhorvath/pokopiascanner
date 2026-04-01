import { useState, useCallback, useRef, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import VideoScanner from './components/VideoScanner';
import ScanResults from './components/ScanResults';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsConditions from './components/TermsConditions';
import HowToGuide from './components/HowToGuide';
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
  HOWTO: 'howto',
};

// Map hash routes to pages
const HASH_TO_PAGE = {
  '#/privacy': PAGES.PRIVACY,
  '#/terms': PAGES.TERMS,
  '#/how-to': PAGES.HOWTO,
};

const PAGE_TO_HASH = {
  [PAGES.PRIVACY]: '#/privacy',
  [PAGES.TERMS]: '#/terms',
  [PAGES.HOWTO]: '#/how-to',
};

function getPageFromHash() {
  const hash = window.location.hash;
  return HASH_TO_PAGE[hash] || null;
}

export default function App() {
  const [page, setPage] = useState(() => getPageFromHash() || PAGES.LANDING);
  const [videoFiles, setVideoFiles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [scanCount, setScanCount] = useState(0);

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

  const handleStartScan = useCallback((files, scanSettings) => {
    setVideoFiles(files);
    setSettings(scanSettings);
    navigateTo(PAGES.SCANNING);
  }, [navigateTo]);

  const handleScanComplete = useCallback((results) => {
    if (scanResults) {
      setScanResults(mergeResults(scanResults, results));
    } else {
      setScanResults(results);
    }
    setScanCount(prev => prev + 1);
    navigateTo(PAGES.RESULTS);
  }, [scanResults, navigateTo]);

  const handleImportResults = useCallback((imported) => {
    if (scanResults) {
      setScanResults(mergeResults(scanResults, imported));
    } else {
      setScanResults(imported);
    }
    setScanCount(prev => prev + 1);
    navigateTo(PAGES.RESULTS);
  }, [scanResults, navigateTo]);

  // Go back to landing to add more videos (keeps results)
  const handleAddMore = useCallback(() => {
    setVideoFiles([]);
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  // Clear everything and start fresh
  const handleStartFresh = useCallback(() => {
    setScanResults(null);
    setScanCount(0);
    setVideoFiles([]);
    setSettings(null);
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  const handleCancelScan = useCallback(() => {
    navigateTo(scanResults ? PAGES.RESULTS : PAGES.LANDING);
  }, [navigateTo, scanResults]);

  const handleBackToScanner = useCallback(() => {
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  const handleOpenCookieSettings = useCallback(() => {
    if (cookieSettingsRef.current) {
      cookieSettingsRef.current();
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-base-100">
      {/* Header - shown on scanning, results, and legal pages */}
      {page !== PAGES.LANDING && (
        <div className="navbar bg-base-200 shadow-md sticky top-0 z-40">
          <div className="navbar-start">
            <button className="btn btn-ghost gap-2 text-lg" onClick={handleAddMore}>
              <span className="text-2xl">{"🔍"}</span>
              <span className="font-bold hidden sm:inline">Pokopia Scanner</span>
            </button>
          </div>
          {scanResults && page !== PAGES.RESULTS && (
            <div className="navbar-end">
              <button className="btn btn-ghost btn-sm" onClick={() => navigateTo(PAGES.RESULTS)}>
                📊 Results
                <span className="badge badge-primary badge-sm ml-1">{scanResults.totalFound}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        {page === PAGES.LANDING && (
          <>
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_LANDING_TOP} position="top" />
            <LandingPage
              onStartScan={handleStartScan}
              onImportResults={handleImportResults}
              onShowHowTo={() => navigateTo(PAGES.HOWTO)}
              existingResults={scanResults}
              scanCount={scanCount}
              onStartFresh={handleStartFresh}
              onViewResults={() => navigateTo(PAGES.RESULTS)}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_LANDING_BOTTOM} position="bottom" />
          </>
        )}

        {page === PAGES.SCANNING && videoFiles.length > 0 && settings && (
          <>
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_TOP} position="top" />
            <VideoScanner
              videoFiles={videoFiles}
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
              scanCount={scanCount}
              onAddMore={handleAddMore}
              onStartFresh={handleStartFresh}
              onImportResults={handleImportResults}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_SCANNER_BOTTOM} position="bottom" />
          </>
        )}

        {page === PAGES.HOWTO && (
          <HowToGuide onBack={handleBackToScanner} />
        )}

        {page === PAGES.PRIVACY && (
          <PrivacyPolicy onBack={handleBackToScanner} />
        )}

        {page === PAGES.TERMS && (
          <TermsConditions onBack={handleBackToScanner} />
        )}
      </main>

      {/* Footer */}
      <footer className="footer footer-center bg-base-200 text-base-content p-6">
        <p className="text-sm opacity-70">Pokopia Progress Scanner &mdash; Track your Pokémon Pokopia collection</p>
        <nav className="flex flex-wrap justify-center gap-2">
          <button className="btn btn-ghost btn-xs" onClick={() => navigateTo(PAGES.HOWTO)}>How to Use</button>
          <span className="opacity-30">|</span>
          <button className="btn btn-ghost btn-xs" onClick={() => navigateTo(PAGES.PRIVACY)}>Privacy Policy</button>
          <span className="opacity-30">|</span>
          <button className="btn btn-ghost btn-xs" onClick={() => navigateTo(PAGES.TERMS)}>Terms &amp; Conditions</button>
          <span className="opacity-30">|</span>
          <button className="btn btn-ghost btn-xs" onClick={handleOpenCookieSettings}>Cookie Settings</button>
        </nav>
      </footer>

      {/* Cookie Consent Banner */}
      <CookieConsent onOpenSettings={cookieSettingsRef} />
    </div>
  );
}
