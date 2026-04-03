import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import LandingPage from './components/LandingPage';
import CookieConsent from './components/CookieConsent';
import { mergeResults } from './utils/ocrEngine.js';
import { saveSession, loadLatestSession, listSessions, loadSession, deleteSession, clearAllSessions } from './utils/scanStorage.js';
import AdBanner from './components/AdBanner';
import './App.css';

// Lazy-loaded components for code splitting
const VideoScanner = lazy(() => import('./components/VideoScanner'));
const ScanResults = lazy(() => import('./components/ScanResults'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsConditions = lazy(() => import('./components/TermsConditions'));
const HowToGuide = lazy(() => import('./components/HowToGuide'));

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

// Loading fallback for lazy components
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(() => getPageFromHash() || PAGES.LANDING);
  const [videoFiles, setVideoFiles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [sessionId, setSessionId] = useState(null);

  const cookieSettingsRef = useRef(null);

  // Load latest session from localStorage on startup
  useEffect(() => {
    const latest = loadLatestSession();
    if (latest && latest.results) {
      setScanResults(latest.results);
      setScanCount(latest.scanCount || 1);
      setSessionId(latest.id);
    }
  }, []);

  // Auto-save to localStorage whenever results change
  useEffect(() => {
    if (scanResults && scanResults.totalFound > 0) {
      const id = saveSession(scanResults, scanCount, sessionId);
      if (id && !sessionId) setSessionId(id);
    }
  }, [scanResults, scanCount]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSessionId(null);
    navigateTo(PAGES.LANDING);
  }, [navigateTo]);

  // Load a specific saved session
  const handleLoadSession = useCallback((id) => {
    const data = loadSession(id);
    if (data && data.results) {
      setScanResults(data.results);
      setScanCount(data.scanCount || 1);
      setSessionId(id);
      navigateTo(PAGES.RESULTS);
    }
  }, [navigateTo]);

  // Delete a saved session
  const handleDeleteSession = useCallback((id) => {
    deleteSession(id);
    // If we deleted the current session, clear state
    if (id === sessionId) {
      setScanResults(null);
      setScanCount(0);
      setSessionId(null);
    }
  }, [sessionId]);

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
              savedSessions={listSessions()}
              onLoadSession={handleLoadSession}
              onDeleteSession={handleDeleteSession}
            />
            <AdBanner adSlot={import.meta.env.VITE_AD_SLOT_LANDING_BOTTOM} position="bottom" />
          </>
        )}

        <Suspense fallback={<LoadingFallback />}>
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
        </Suspense>
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
