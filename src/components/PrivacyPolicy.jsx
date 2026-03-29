import './PrivacyPolicy.css';

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="max-w-4xl mx-auto">
      <button className="btn btn-ghost btn-sm gap-1 mb-6" onClick={onBack}>
        &larr; Back to Scanner
      </button>

      <div className="prose prose-sm sm:prose-base max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-base-content/50 text-sm">Last updated: March 29, 2026</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            Welcome to <strong>Pokopia Progress Scanner</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;).
            This Privacy Policy explains how we collect, use, and protect information when you use our
            web application located at{' '}
            <a href="https://dmnkhorvath.github.io/Pokopiascanner/" target="_blank" rel="noopener noreferrer">
              https://dmnkhorvath.github.io/Pokopiascanner/
            </a>.
          </p>
        </section>

        <section>
          <h2>2. Data We Collect</h2>
          <h3>2.1 Data Processed Locally</h3>
          <p>
            All video processing and OCR scanning is performed entirely in your browser.
            We do <strong>not</strong> upload, transmit, or store your video files or scan results
            on any server. Your videos never leave your device.
          </p>
          <h3>2.2 Data Collected via Third-Party Services</h3>
          <p>
            If you accept cookies, the following third-party services may collect data:
          </p>
          <ul>
            <li><strong>Google Analytics</strong> &mdash; collects anonymous usage data such as page views, session duration, browser type, and approximate geographic location.</li>
            <li><strong>Google AdSense</strong> &mdash; may use cookies to serve personalised or non-personalised advertisements based on your browsing history.</li>
          </ul>
        </section>

        <section>
          <h2>3. Google Analytics</h2>
          <p>
            We use Google Analytics to understand how visitors interact with our site.
            Google Analytics collects information such as how often users visit the site,
            what pages they visit, and what other sites they used prior to coming to this site.
          </p>
          <p>
            We use Google Consent Mode v2, which means Google Analytics only collects data
            after you explicitly accept cookies via our consent banner.
            You can learn more about how Google uses data at{' '}
            <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
              Google&apos;s Partner Sites Policy
            </a>.
          </p>
        </section>

        <section>
          <h2>4. Google AdSense</h2>
          <p>
            We use Google AdSense to display advertisements. AdSense may use cookies and web beacons
            to serve ads based on your prior visits to this or other websites. You may opt out of
            personalised advertising by visiting{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
              Google Ads Settings
            </a>.
          </p>
          <p>
            Advertisements are only displayed if you accept cookies. If you reject non-essential
            cookies, no ads will be shown and no ad-related cookies will be set.
          </p>
        </section>

        <section>
          <h2>5. Your Rights (GDPR)</h2>
          <p>If you are located in the European Economic Area (EEA), you have the following rights:</p>
          <ul>
            <li><strong>Right to Access</strong> &mdash; You can request information about what data is collected about you.</li>
            <li><strong>Right to Erasure</strong> &mdash; You can request deletion of your data.</li>
            <li><strong>Right to Rectification</strong> &mdash; You can request correction of inaccurate data.</li>
            <li><strong>Right to Restrict Processing</strong> &mdash; You can request that we limit how we process your data.</li>
            <li><strong>Right to Data Portability</strong> &mdash; You can request a copy of your data in a portable format.</li>
            <li><strong>Right to Object</strong> &mdash; You can object to processing of your data for certain purposes.</li>
            <li><strong>Right to Withdraw Consent</strong> &mdash; You can withdraw your cookie consent at any time by clicking &ldquo;Cookie Settings&rdquo; in the footer.</li>
          </ul>
        </section>

        <section>
          <h2>6. Managing Cookie Preferences</h2>
          <p>
            You can change your cookie preferences at any time by clicking the
            &ldquo;Cookie Settings&rdquo; link in the website footer. This will re-display the
            consent banner, allowing you to accept or reject non-essential cookies.
          </p>
          <p>
            You can also clear cookies through your browser settings. Note that clearing
            <code>localStorage</code> will reset your consent preference.
          </p>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We do not store any personal data on our servers. Google Analytics and AdSense
            retain data according to their own retention policies. Your cookie consent
            preference is stored in your browser&apos;s <code>localStorage</code> and persists
            until you clear it or change your preference.
          </p>
        </section>

        <section>
          <h2>8. Data Security</h2>
          <p>
            Since all video processing occurs locally in your browser, your video data is
            inherently secure &mdash; it never leaves your device. For third-party services,
            we rely on Google&apos;s security measures. If you discover a security vulnerability,
            please contact us so we can take appropriate action.
          </p>
        </section>

        <section>
          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any
            changes by posting the new Privacy Policy on this page and updating the
            &ldquo;Last updated&rdquo; date.
          </p>
        </section>

        <section>
          <h2>10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or wish to exercise your
            GDPR rights, please contact us at:
          </p>
          <p>
            <strong>Pokopia Progress Scanner</strong><br />
            Email: <a href="mailto:hello@dominikh.com">hello@dominikh.com</a>
          </p>
        </section>
      </div>

      <button className="btn btn-ghost btn-sm gap-1 mt-8 mb-4" onClick={onBack}>
        &larr; Back to Scanner
      </button>
    </div>
  );
}
