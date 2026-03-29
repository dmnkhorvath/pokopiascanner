import './PrivacyPolicy.css';

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="legal-page">
      <div className="legal-page__container">
        <button className="legal-page__back" onClick={onBack}>&larr; Back to Scanner</button>

        <h1>Privacy Policy</h1>
        <p className="legal-page__updated">Last updated: March 29, 2026</p>

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
            on any server. Your data stays on your device.
          </p>
          <h3>2.2 Cookies &amp; Local Storage</h3>
          <p>We use the following browser storage:</p>
          <ul>
            <li><strong>Cookie consent preference</strong> &mdash; stored in <code>localStorage</code> to remember whether you accepted or rejected non-essential cookies.</li>
            <li><strong>Scan results</strong> &mdash; optionally stored in <code>localStorage</code> for your convenience.</li>
          </ul>
          <h3>2.3 Third-Party Cookies</h3>
          <p>If you accept cookies, the following third-party services may set cookies:</p>
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
            We use this information solely to improve our service.
          </p>
          <p>
            Google Analytics is only loaded if you explicitly accept cookies via our consent banner.
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
          <h2>5. Your Rights Under GDPR</h2>
          <p>If you are located in the European Economic Area (EEA), you have the following rights:</p>
          <ul>
            <li><strong>Right of Access</strong> &mdash; You can request information about what data we process about you.</li>
            <li><strong>Right to Rectification</strong> &mdash; You can request correction of inaccurate data.</li>
            <li><strong>Right to Erasure</strong> &mdash; You can request deletion of your data.</li>
            <li><strong>Right to Restrict Processing</strong> &mdash; You can request that we limit how we use your data.</li>
            <li><strong>Right to Data Portability</strong> &mdash; You can request a copy of your data in a machine-readable format.</li>
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
            <code>localStorage</code> will reset your consent preference and any saved scan results.
          </p>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We do not store any personal data on our servers. Google Analytics and AdSense
            retain data according to their own retention policies. Local storage data persists
            until you clear it manually or through your browser settings.
          </p>
        </section>

        <section>
          <h2>8. Children&apos;s Privacy</h2>
          <p>
            Our service is not directed to children under 16. We do not knowingly collect
            personal information from children. If you believe a child has provided us with
            personal data, please contact us so we can take appropriate action.
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
          <p className="legal-page__contact">
            <strong>Pokopia Progress Scanner</strong><br />
            Email: <a href="mailto:contact@example.com">contact@example.com</a>
          </p>
        </section>

        <button className="legal-page__back legal-page__back--bottom" onClick={onBack}>&larr; Back to Scanner</button>
      </div>
    </div>
  );
}
