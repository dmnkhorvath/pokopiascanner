import { useEffect, useRef, useState } from 'react';
import { hasConsent } from './CookieConsent';

export default function AdBanner({ adSlot, position = 'top', format = 'horizontal' }) {
  const adRef = useRef(null);
  const pushedRef = useRef(false);
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const [consentGiven, setConsentGiven] = useState(hasConsent());

  // Listen for consent changes so ads appear/disappear without page reload
  useEffect(() => {
    const handler = () => setConsentGiven(hasConsent());
    window.addEventListener('cookie-consent-changed', handler);
    return () => window.removeEventListener('cookie-consent-changed', handler);
  }, []);

  useEffect(() => {
    if (!consentGiven || !adClient || !adSlot || pushedRef.current) return;

    const container = adRef.current;
    if (!container) return;

    // Wait until the container has actual width before pushing the ad
    const tryPushAd = () => {
      const width = container.offsetWidth;
      if (width <= 0) {
        // Container not laid out yet, retry on next frame
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

    // Delay to ensure DOM layout is complete
    requestAnimationFrame(tryPushAd);
  }, [consentGiven, adClient, adSlot, format]);

  if (!consentGiven || !adClient || !adSlot) return null;

  return (
    <div
      className={`w-full min-h-[90px] ${
        position === 'top' ? 'mb-4' : 'mt-4'
      }`}
      ref={adRef}
      style={{ minWidth: '300px' }}
    />
  );
}
