import { useEffect, useRef } from 'react';
import './AdBanner.css';

export default function AdBanner({ adSlot, position = 'top', format = 'horizontal' }) {
  const adRef = useRef(null);
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;

  useEffect(() => {
    if (!adClient || !adSlot) return;
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
  }, [adClient, adSlot, format]);

  if (!adClient || !adSlot) return null;

  return (
    <div className={`ad-banner ad-banner--${position}`} ref={adRef} />
  );
}
