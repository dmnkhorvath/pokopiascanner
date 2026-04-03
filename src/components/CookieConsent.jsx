import { useState, useEffect, useCallback } from 'react';
import './CookieConsent.css';

const STORAGE_KEY = 'pokopia_cookie_consent';

/**
 * Returns true when the user has explicitly accepted cookies.
 * Safe to call anywhere (components, effects, event handlers).
 */
export function hasConsent() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Updates Google Consent Mode v2 to grant all storage types.
 */
function grantConsent() {
  if (typeof gtag === 'function') {
    gtag('consent', 'update', {
      'analytics_storage': 'granted',
      'ad_storage': 'granted',
      'ad_user_data': 'granted',
      'ad_personalization': 'granted',
    });
  }
}

export default function CookieConsent({ onOpenSettings, onNavigatePrivacy }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const pref = localStorage.getItem(STORAGE_KEY);
      if (!pref) {
        setVisible(true);
      } else if (pref === 'accepted') {
        grantConsent();
      }
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (onOpenSettings) {
      onOpenSettings.current = () => setVisible(true);
    }
  }, [onOpenSettings]);

  const handleAccept = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'accepted'); } catch { /* noop */ }
    grantConsent();
    setVisible(false);
    window.dispatchEvent(new Event('cookie-consent-changed'));
  }, []);

  const handleReject = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'rejected'); } catch { /* noop */ }
    setVisible(false);
    window.dispatchEvent(new Event('cookie-consent-changed'));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4" role="dialog" aria-label="Cookie consent">
      <div className="alert shadow-lg max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-base-content/80">
            We use cookies for analytics (Google Analytics) and advertising (Google AdSense).
            You can accept all cookies or reject non-essential ones.
            See our <button className="link link-primary text-sm" onClick={() => { if (onNavigatePrivacy) onNavigatePrivacy(); }}>Privacy Policy</button> for details.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn btn-primary btn-sm" onClick={handleAccept}>
            Accept All
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleReject}>
            Reject Non-Essential
          </button>
        </div>
      </div>
    </div>
  );
}
