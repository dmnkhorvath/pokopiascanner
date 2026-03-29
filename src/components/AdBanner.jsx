import { useEffect, useRef, useState } from 'react';
import { hasConsent } from './CookieConsent';
import './AdBanner.css';

export default function AdBanner({ adSlot, position = 'top', format = 'horizontal' }) {
  const adRef = useRef(null);
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const [consentGiven, setConsentGiven] = useState(hasConsent());

  // Listen for consent changes so ads appear/disappear without page reload
  useEffect(() => {
    const handler = () => setConsentGiven(hasConsent());
    window.addEventListener('cookie-consent-changed', handler);
    return () => window.removeEventListener('cookie-consent-changed', handler);
  }, []);

  useEffect(() => {
    if (!consentGiven || !adClient || !adSlot) return;
    try {
      if (adRef.current && adRef.current.childNodes.length === 0) {
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', adClient);
        ins.setAttribute('data-ad-slot', adSlot);
        ins.setAttribute('data-ad-format', format === 'horizontal' ? 'auto' : format);
        ins.setAttribute('data-full-width-responsive', 'true');
        adRef.current.appendChild(ins);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.warn('AdSense error:', e);
    }
  }, [consentGiven, adClient, adSlot, format]);

  if (!consentGiven || !adClient || !adSlot) return null;

  return (
    <div
      className={`w-full flex justify-center ${
        position === 'top' ? 'mb-4' : 'mt-4'
      }`}
      ref={adRef}
    />
  );
}
