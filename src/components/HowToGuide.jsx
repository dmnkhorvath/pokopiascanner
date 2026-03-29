import './HowToGuide.css';

const steps = [
  {
    number: 1,
    icon: '🎮',
    title: 'Open & Browse Your Collection',
    description: 'Navigate to the section you want to scan and step through every entry.',
    tips: [
      'Open your Pokédex, Habitat list, Item bag, or Recipe book',
      'Select the first entry in the list to open its detail view',
      'Keep pressing the ZR button to step through entries one by one until you reach the end',
      'The scanner reads each detail page as it appears — no need to scroll manually',
    ],
  },
  {
    number: 2,
    icon: '🔴',
    title: 'Record a Video on Your Switch',
    description: 'Use the Nintendo Switch capture feature to record your browsing session.',
    tips: [
      'Hold the Capture button (square button on the left Joy-Con) to save the last 30 seconds of gameplay',
      'The video is saved to your Album automatically',
      'If stepping through all entries takes longer than 30 seconds, split it into multiple recordings — just pick up where you left off',
      'You can upload multiple video chunks to the scanner and merge the results',
    ],
  },
  {
    number: 3,
    icon: '📲',
    title: 'Transfer the Video to Your Device',
    description: 'Use Nintendo\u2019s built-in sharing to get the video onto your phone or computer.',
    methods: [
      {
        name: '📱 To Phone (QR Code)',
        steps: [
          'Go to Album on your Switch',
          'Select the video and choose "Send to Smartphone"',
          'Scan the first QR code with your phone camera to connect to the Switch\'s Wi-Fi',
          'Scan the second QR code to download the video',
        ],
      },
      {
        name: '💻 To Computer (USB)',
        steps: [
          'Connect your Switch to your PC/Mac with a USB-C cable',
          'On the Switch, go to System Settings → Data Management → Manage Screenshots and Videos → Copy to a Computer via USB Connection',
          'Your Switch appears as a USB drive — copy the video files',
        ],
      },
      {
        name: '💾 Via microSD Card',
        steps: [
          'If your videos are on a microSD card, power off the Switch and remove the card',
          'Insert the microSD into your computer using an adapter',
          'Copy the video files from the DCIM or Album folder',
        ],
      },
    ],
  },
  {
    number: 4,
    icon: '📤',
    title: 'Upload & Scan',
    description: 'Drag and drop your video into the Pokopia Scanner and let it do the work.',
    tips: [
      'Drag the video file onto the upload area, or click to browse',
      'Choose a scan mode: Habitats, Pokémon, Items, Recipes, or All',
      'Hit "Start Scan" and watch the live detection feed',
      'The scanner extracts frames, runs OCR, and matches entries automatically',
    ],
  },
  {
    number: 5,
    icon: '📊',
    title: 'Review & Export Your Progress',
    description: 'Browse your results, check completion, and export your data.',
    tips: [
      'Switch between category tabs to see what was found',
      'Use search and filters to find specific entries',
      'Export your results as JSON to save or share',
      'Import previous scans to merge and track progress over time',
    ],
  },
];

export default function HowToGuide({ onBack }) {
  return (
    <div className="howto">
      <div className="howto__container">
        <button className="howto__back" onClick={onBack}>
          \u2190 Back to Scanner
        </button>

        <div className="howto__hero">
          <h1 className="howto__title">\uD83D\uDCD6 How to Use Pokopia Scanner</h1>
          <p className="howto__subtitle">
            Scan your Nintendo Switch gameplay videos to track your Pokopia collection progress.
            Just 5 easy steps!
          </p>
        </div>

        <div className="howto__steps">
          {steps.map((step) => (
            <div key={step.number} className="howto__step">
              <div className="howto__step-header">
                <span className="howto__step-number">{step.number}</span>
                <span className="howto__step-icon">{step.icon}</span>
                <h2 className="howto__step-title">{step.title}</h2>
              </div>
              <p className="howto__step-desc">{step.description}</p>

              {step.tips && (
                <ul className="howto__tips">
                  {step.tips.map((tip, i) => (
                    <li key={i} className="howto__tip">{tip}</li>
                  ))}
                </ul>
              )}

              {step.methods && (
                <div className="howto__methods">
                  {step.methods.map((method, i) => (
                    <div key={i} className="howto__method">
                      <h3 className="howto__method-name">{method.name}</h3>
                      <ol className="howto__method-steps">
                        {method.steps.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="howto__cta">
          <p>Ready to scan?</p>
          <button className="howto__cta-btn" onClick={onBack}>
            \uD83D\uDD0D Start Scanning
          </button>
        </div>
      </div>
    </div>
  );
}
