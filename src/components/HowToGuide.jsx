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
    description: 'Use Nintendo’s built-in sharing to get the video onto your phone or computer.',
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
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button className="btn btn-ghost btn-sm gap-1 mb-6" onClick={onBack}>
        ← Back to Scanner
      </button>

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">How to Use Pokopia Scanner</h1>
        <p className="text-base-content/60 max-w-2xl mx-auto">
          Follow these simple steps to scan your Pokémon Pokopia collection from a Nintendo Switch video recording.
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-6">
        {steps.map((step) => (
          <div key={step.number} className="card bg-base-200 shadow-md">
            <div className="card-body">
              {/* Step header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="badge badge-primary badge-lg font-bold text-lg w-10 h-10 flex items-center justify-center">
                  {step.number}
                </div>
                <span className="text-2xl">{step.icon}</span>
                <h2 className="card-title text-lg sm:text-xl">{step.title}</h2>
              </div>

              <p className="text-base-content/70 mb-3">{step.description}</p>

              {/* Tips list */}
              {step.tips && (
                <ul className="list-disc list-inside space-y-1 text-sm text-base-content/80">
                  {step.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              )}

              {/* Transfer methods */}
              {step.methods && (
                <div className="grid gap-4 mt-2 sm:grid-cols-3">
                  {step.methods.map((method, i) => (
                    <div key={i} className="bg-base-300 rounded-lg p-4">
                      <h3 className="font-semibold text-sm mb-2">{method.name}</h3>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-base-content/70">
                        {method.steps.map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center mt-10 mb-6">
        <p className="text-base-content/60 mb-3">Ready to scan?</p>
        <button className="btn btn-primary btn-lg gap-2" onClick={onBack}>
          🔍 Start Scanning
        </button>
      </div>
    </div>
  );
}
