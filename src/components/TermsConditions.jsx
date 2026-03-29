import './TermsConditions.css';

export default function TermsConditions({ onBack }) {
  return (
    <div className="max-w-4xl mx-auto">
      <button className="btn btn-ghost btn-sm gap-1 mb-6" onClick={onBack}>
        &larr; Back to Scanner
      </button>

      <div className="prose prose-sm sm:prose-base max-w-none">
        <h1>Terms &amp; Conditions</h1>
        <p className="text-base-content/50 text-sm">Last updated: March 29, 2026</p>

        <section>
          <h2>1. Service Description</h2>
          <p>
            <strong>Pokopia Progress Scanner</strong> is a free, open-source web application that
            allows users to upload Nintendo Switch video recordings of Pok&eacute;mon Pokopia gameplay
            and scan them using Optical Character Recognition (OCR) to track collection progress
            for Pok&eacute;mon, items, habitats, and recipes.
          </p>
          <p>
            All video processing occurs entirely within your web browser. No account creation is
            required, and no video data is transmitted to any server.
          </p>
        </section>

        <section>
          <h2>2. Acceptance of Terms</h2>
          <p>
            By accessing or using Pokopia Progress Scanner, you agree to be bound by these
            Terms &amp; Conditions. If you do not agree to these terms, please do not use the service.
          </p>
        </section>

        <section>
          <h2>3. Intellectual Property</h2>
          <p>
            Pok&eacute;mon, Pok&eacute;mon Pokopia, and all related names, characters, and imagery are
            trademarks and copyrights of Nintendo, The Pok&eacute;mon Company, and Game Freak.
            This application is an independent fan project and is not affiliated with,
            endorsed by, or sponsored by any of these companies.
          </p>
          <p>
            The source code of Pokopia Progress Scanner is available under its respective open-source
            license. The application&apos;s design, branding, and non-Pok&eacute;mon assets are the
            property of the project maintainers.
          </p>
        </section>

        <section>
          <h2>4. User Responsibilities</h2>
          <ul>
            <li>You are responsible for the content you upload (video recordings).</li>
            <li>You agree to use the service only for its intended purpose of tracking game progress.</li>
            <li>You will not attempt to reverse-engineer, exploit, or misuse the service.</li>
          </ul>
        </section>

        <section>
          <h2>5. Disclaimer of Warranties</h2>
          <p>
            This service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
            <strong>&ldquo;as available&rdquo;</strong> without warranties of any kind, either express
            or implied, including but not limited to the implied warranties of merchantability,
            fitness for a particular purpose, or non-infringement.
          </p>
          <p>
            We do not guarantee that:
          </p>
          <ul>
            <li>The OCR scanning will be 100% accurate.</li>
            <li>The service will be uninterrupted or error-free.</li>
            <li>The results will be complete or up-to-date with the latest game content.</li>
          </ul>
        </section>

        <section>
          <h2>6. Limitation of Liability</h2>
          <p>
            In no event shall the developers or maintainers of Pokopia Progress Scanner be liable
            for any indirect, incidental, special, consequential, or punitive damages arising out
            of or related to your use of the service.
          </p>
        </section>

        <section>
          <h2>7. Third-Party Services</h2>
          <p>This application integrates the following third-party services:</p>
          <ul>
            <li>
              <strong>Google Analytics</strong> &mdash; Used for anonymous usage analytics.
              Subject to{' '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
                Google&apos;s Terms of Service
              </a>.
            </li>
            <li>
              <strong>Google AdSense</strong> &mdash; Used to display advertisements.
              Subject to{' '}
              <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
                Google&apos;s Advertising Policies
              </a>.
            </li>
          </ul>
          <p>
            These services are only active if you accept cookies via our consent banner.
            We are not responsible for the practices of these third-party services.
          </p>
        </section>

        <section>
          <h2>8. Privacy</h2>
          <p>
            Your use of the service is also governed by our Privacy Policy, which describes
            how we handle cookies, analytics, and your data. Please review it for full details.
          </p>
        </section>

        <section>
          <h2>9. Changes to These Terms</h2>
          <p>
            We reserve the right to modify these Terms &amp; Conditions at any time. Changes will
            be effective immediately upon posting to this page. Your continued use of the service
            after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2>10. Governing Law</h2>
          <p>
            These terms shall be governed by and construed in accordance with applicable laws.
            Any disputes arising from these terms or your use of the service shall be resolved
            in the appropriate courts of the applicable jurisdiction.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            If you have any questions about these Terms &amp; Conditions, please contact us at:
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
