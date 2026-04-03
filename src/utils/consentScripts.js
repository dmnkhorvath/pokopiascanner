/**
 * Consent-gated script loaders for Google Analytics and AdSense.
 *
 * These functions dynamically inject third-party scripts ONLY after
 * the user has explicitly granted cookie consent (GDPR/ePrivacy compliance).
 *
 * The gtag() function and Consent Mode v2 defaults are defined in index.html
 * so they're available immediately, but the actual GA/AdSense network requests
 * are deferred until these functions are called.
 */

let gaInitialized = false;
let adsenseInitialized = false;

/**
 * Dynamically load Google Analytics gtag.js and configure it.
 * Idempotent — safe to call multiple times; only injects once.
 * Also updates Consent Mode to grant analytics + ad storage.
 */
export function initAnalytics() {
  if (gaInitialized) return;

  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId) {
    console.warn('[consentScripts] VITE_GA_MEASUREMENT_ID not set, skipping GA init');
    return;
  }

  gaInitialized = true;

  // Update consent to granted
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  }

  // Dynamically inject the gtag.js script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  // Configure GA once the script loads (gtag function already defined in index.html)
  if (typeof window.gtag === 'function') {
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
  }
}

/**
 * Dynamically load the Google AdSense script.
 * Idempotent — safe to call multiple times; only injects once.
 */
export function initAdsense() {
  if (adsenseInitialized) return;

  const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT;
  if (!adsenseClient) {
    // No AdSense client configured — skip silently
    return;
  }

  adsenseInitialized = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-ad-frequency-hint', '30s');
  document.head.appendChild(script);
}

/**
 * Initialize all consent-gated scripts at once.
 * Call this when the user accepts cookies or on mount if previously accepted.
 */
export function initAllConsentScripts() {
  initAnalytics();
  initAdsense();
}
