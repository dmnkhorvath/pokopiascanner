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
 * GA script is already loaded in index.html with defaults set to 'denied'.
 * This function flips consent to 'granted' so GA starts collecting data.
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

export default function CookieConsent({ onOpenSettings }) {
  const [visible, setVisible] = useState(false);

  // Show banner only when no preference has been stored yet
  useEffect(() => {
    try {
      const pref = localStorage.getItem(STORAGE_KEY);
      if (!pref) {
        setVisible(true);
      } else if (pref === 'accepted') {
        // Returning visitor who already accepted - grant consent
        grantConsent();
      }
    } catch {
      setVisible(true);
    }
  }, []);

  // Allow parent (footer link) to re-open the banner
  useEffect(() => {
    if (onOpenSettings) {
      onOpenSettings.current = () => setVisible(true);
    }
  }, [onOpenSettings]);

  const handleAccept = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'accepted'); } catch { /* noop */ }
    grantConsent();
    setVisible(false);
    // Force re-render of ad components by dispatching a custom event
    window.dispatchEvent(new Event('cookie-consent-changed'));
  }, []);

  const handleReject = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'rejected'); } catch { /* noop */ }
    setVisible(false);
    window.dispatchEvent(new Event('cookie-consent-changed'));
  }, []);

  if (!visible) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <div className="cookie-consent__inner">
        <p className="cookie-consent__text">
          We use cookies for analytics (Google Analytics) and advertising (Google AdSense).
          You can accept all cookies or reject non-essential ones.
          See our <button className="cookie-consent__link" onClick={() => { /* handled by parent */ }}>Privacy Policy</button> for details.
        </p>
        <div className="cookie-consent__actions">
          <button className="cookie-consent__btn cookie-consent__btn--accept" onClick={handleAccept}>
            Accept All
          </button>
          <button className="cookie-consent__btn cookie-consent__btn--reject" onClick={handleReject}>
            Reject Non-Essential
          </button>
        </div>
      </div>
    </div>
  );
}
