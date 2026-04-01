import { useEffect, useRef, useState } from 'react';
import { hasConsent } from './CookieConsent';

/**
 * Dual-provider ad banner supporting AdSense and Adsterra.
 *
 * Provider selection (VITE_AD_PROVIDER):
 *   - 'adsense'  → Google AdSense
 *   - 'adsterra' → Adsterra banners (728x90 desktop / 320x50 mobile)
 *   - unset      → auto-detect: Adsterra if keys present, else AdSense
 *
 * Adsterra env vars:
 *   VITE_ADSTERRA_DESKTOP_KEY  → 728x90 banner key
 *   VITE_ADSTERRA_MOBILE_KEY   → 320x50 banner key
 *
 * AdSense env vars (unchanged):
 *   VITE_ADSENSE_CLIENT, VITE_AD_SLOT_*
 */

const MOBILE_BREAKPOINT = 768;

function getProvider() {
  const explicit = import.meta.env.VITE_AD_PROVIDER;
  if (explicit === 'adsense') return 'adsense';
  if (explicit === 'adsterra') return 'adsterra';
  // Auto-detect: prefer Adsterra if keys are set
  if (import.meta.env.VITE_ADSTERRA_DESKTOP_KEY || import.meta.env.VITE_ADSTERRA_MOBILE_KEY) {
    return 'adsterra';
  }
  if (import.meta.env.VITE_ADSENSE_CLIENT) return 'adsense';
  return null;
}

// ── Adsterra Banner ─────────────────────────────────────────────────────────
function AdsterraBanner({ position }) {
  const containerRef = useRef(null);
  const loadedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );

  // Track viewport changes
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const desktopKey = import.meta.env.VITE_ADSTERRA_DESKTOP_KEY;
  const mobileKey = import.meta.env.VITE_ADSTERRA_MOBILE_KEY;
  const activeKey = isMobile ? (mobileKey || desktopKey) : (desktopKey || mobileKey);
  const width = isMobile ? 320 : 728;
  const height = isMobile ? 50 : 90;

  useEffect(() => {
    if (!activeKey || !containerRef.current) return;

    // Clear previous ad when switching mobile/desktop
    const container = containerRef.current;
    container.innerHTML = '';
    loadedRef.current = false;

    const tryLoad = () => {
      if (container.offsetWidth <= 0) {
        requestAnimationFrame(tryLoad);
        return;
      }
      if (loadedRef.current) return;
      loadedRef.current = true;

      // Inject atOptions + invoke script
      const optScript = document.createElement('script');
      optScript.type = 'text/javascript';
      optScript.text = `atOptions = { 'key': '${activeKey}', 'format': 'iframe', 'height': ${height}, 'width': ${width}, 'params': {} };`;
      container.appendChild(optScript);

      const invokeScript = document.createElement('script');
      invokeScript.type = 'text/javascript';
      invokeScript.src = `//www.highperformanceformat.com/${activeKey}/invoke.js`;
      container.appendChild(invokeScript);
    };

    requestAnimationFrame(tryLoad);
  }, [activeKey, isMobile, width, height]);

  if (!activeKey) return null;

  return (
    <div
      ref={containerRef}
      className={`flex justify-center w-full ${
        position === 'top' ? 'mb-4' : 'mt-4'
      }`}
      style={{ minHeight: `${height}px`, maxHeight: `${height + 20}px`, overflow: 'hidden' }}
    />
  );
}

// ── AdSense Banner (original logic) ─────────────────────────────────────────
function AdSenseBanner({ adSlot, position, format }) {
  const adRef = useRef(null);
  const pushedRef = useRef(false);
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;

  useEffect(() => {
    if (!adClient || !adSlot || pushedRef.current) return;

    const container = adRef.current;
    if (!container) return;

    const tryPushAd = () => {
      const width = container.offsetWidth;
      if (width <= 0) {
        requestAnimationFrame(tryPushAd);
        return;
      }
      if (pushedRef.current) return;
      pushedRef.current = true;

      try {
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.style.width = '100%';
        ins.style.minWidth = width + 'px';
        ins.setAttribute('data-ad-client', adClient);
        ins.setAttribute('data-ad-slot', adSlot);
        ins.setAttribute('data-ad-format', format === 'horizontal' ? 'auto' : format);
        ins.setAttribute('data-full-width-responsive', 'true');
        container.appendChild(ins);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn('AdSense error:', e);
        pushedRef.current = false;
      }
    };

    requestAnimationFrame(tryPushAd);
  }, [adClient, adSlot, format]);

  if (!adClient || !adSlot) return null;

  return (
    <div
      className={`w-full min-h-[90px] ${
        position === 'top' ? 'mb-4' : 'mt-4'
      }`}
      ref={adRef}
      style={{ minWidth: '300px', maxHeight: '110px', overflow: 'hidden' }}
    />
  );
}

// ── Main AdBanner (consent gate + provider switch) ──────────────────────────
export default function AdBanner({ adSlot, position = 'top', format = 'horizontal' }) {
  const [consentGiven, setConsentGiven] = useState(hasConsent());

  useEffect(() => {
    const handler = () => setConsentGiven(hasConsent());
    window.addEventListener('cookie-consent-changed', handler);
    return () => window.removeEventListener('cookie-consent-changed', handler);
  }, []);

  if (!consentGiven) return null;

  const provider = getProvider();
  if (!provider) return null;

  if (provider === 'adsterra') {
    return <AdsterraBanner position={position} />;
  }

  return <AdSenseBanner adSlot={adSlot} position={position} format={format} />;
}
