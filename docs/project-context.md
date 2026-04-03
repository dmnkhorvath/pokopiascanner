# Pokopia Scanner — Project Context

> LLM-optimized reference. Updated 2026-04-03.

## 1. Project Overview

- **What**: Browser-based progress tracker for Pokémon Pokopia. Users upload Nintendo Switch video recordings; client-side OCR + grid-based icon recognition scans items/Pokémon/habitats/recipes and tracks collection completion.
- **Who**: Pokémon Pokopia players wanting to track collection progress without manual entry.
- **Stack**: Vite 6 + React 18.3.1 + Tesseract.js 5.1.1 + TailwindCSS 4.2 + DaisyUI 5.5 (dark theme default)
- **Runtime**: 100% client-side JavaScript — no backend, no server-side processing
- **Deployment**:
  - **GitHub Pages**: `https://dmnkhorvath.github.io/Pokopiascanner/` (auto-deploy on push to `main` via GitHub Actions, `VITE_BASE_PATH=/Pokopiascanner/`)
  - **Docker/nginx**: `https://dominikh.com/Pokopiascanner/` (multi-stage Dockerfile → nginx, `VITE_BASE_PATH=/Pokopiascanner/`)
- **Repo**: `https://github.com/dmnkhorvath/Pokopiascanner`
- **Dataset totals**: 300 Pokémon, 1254 Items, 209 Habitats, 743 Recipes, 1746 OCR lookup entries, 1302 icon fingerprints

---

## 2. Architecture

### 2.1 Component Tree & Data Flow

```
App.jsx (root)
├── LandingPage          — drag-drop upload, settings, import/export, session management
├── VideoScanner (lazy)  — orchestrates per-video scanning pipeline, live preview
│   └── ProgressBar      — DaisyUI progress bar wrapper
├── ScanResults (lazy)   — category tabs, search, grid/list, export/import
│   └── CategoryCard     — per-category progress card
├── HowToGuide (lazy)    — step-by-step usage instructions
├── PrivacyPolicy (lazy) — GDPR/privacy content
├── TermsConditions (lazy) — legal terms
├── AdBanner             — Adsterra/AdSense ad slots (consent-gated)
├── CookieConsent        — GDPR cookie consent banner + Google Consent Mode v2
└── ErrorBoundary        — React error boundary wrapper
```

**State management**: React `useState` + `useCallback` in `App.jsx`. No external state library.
- `page` — current view (landing/scanning/results/privacy/terms/howto)
- `videoFiles` — array of `{file, scanMode}` objects
- `settings` — scanner configuration object
- `scanResults` — aggregated scan results across all videos
- `scanCount` — number of completed scans in session
- `sessionId` — localStorage session identifier

**Routing**: Hash-based SPA routing (`#/privacy`, `#/terms`, `#/how-to`). Non-routable pages (landing, scanning, results) clear the hash. Browser back/forward supported via `hashchange` listener.

### 2.2 OCR Pipeline (ocrEngine.js)

```
Video File
  → Load into <video> element
  → Auto-detect FPS (median frame interval, 5s timeout)
  → Determine scan mode routing:
      ├── habitat/pokemon → OCR text pipeline (Tesseract workers)
      └── item/recipe → Grid pipeline (gridEngine.js)
  → Extract frames at configurable intervals
  → For OCR modes:
      → Crop region (auto/full/rightHalf/leftHalf/center/custom)
      → Preprocess: grayscale → threshold (B&W at 128) → artifact removal
      → Tesseract.js worker pool (parallel OCR)
      → Frame deduplication
      → Text matching: exact match → fuzzy match fallback
      → Categorize results by type
  → For grid modes:
      → Route to scanGridVideo()
  → Merge results → return finalResults
```

**Worker pool**: Creates N Tesseract workers (auto-sized, reduced on mobile). Workers initialized with English language pack. Pool terminated after scan completes.

**Text matching** (fuzzyMatch.js):
1. Split OCR text into lines, trim, filter empty
2. Each line: exact match (case-insensitive) against ocrLookup.json
3. If no exact match: Levenshtein fuzzy match (configurable tolerance, default 2)
4. Prefix index (first 2 chars) for fast candidate lookup
5. Full scan fallback for short strings (≤15 chars)
6. Lines also split by separators (commas, semicolons, pipes, slashes)
7. Deduplication via `Set` of seen names

### 2.3 Grid Engine Pipeline (gridEngine.js)

```
Video File
  → ensureGridData() — lazy-load pokopiaDataset.json + iconFingerprints.json
  → Detect grid parameters (scale from 1920×1080 reference)
  → Per-frame loop:
      → Extract frame to canvas
      → Mode-specific processing:
          ├── item/recipe (12-col grid):
          │   → Extract tile icons at grid positions
          │   → Generate 16×16 fingerprint per tile
          │   → Dot-product match against fpVectors (Float32Array)
          │   → D/U row-pattern scroll tracking
          │   → Map to dataset entry via itemTypeMap
          ├── pokemon (8-col grid):
          │   → Saturation/brightness classification per tile
          │   → Pixel cross-correlation scroll tracking
          │   → Map to dataset by absolute row×col position
          └── habitat (4-col grid):
              → Purple/scenic classification per tile
              → Pixel cross-correlation scroll tracking
              → Map to dataset by absolute row×col position
  → Return categorized results with discovered/captured/built metadata
```

**Key constants** (reference resolution 1920×1080):
- Item/Recipe: 12 cols, grid cell ~107px, fingerprint matching (MIN_MATCH_SCORE=0.65)
- Pokémon: 8 cols, saturation-based classification
- Habitat: 4 cols, purple/scenic classification
- Cross-correlation: vertical profile strips for scroll detection

### 2.4 Video Type Auto-Detection (videoDetector.js)

```
Sample 8 positions across video (8%–92%)
  → Extract frame at each position
  → classifyFrame() decision tree:
      1. Teal header (G>200, G>R×1.2) + light edges (lum>220) → "item"
      2. Pinkish header (R>200, R>G, sat>50) + dark edges (lum<180):
         → Content saturation < 6% → "pokemon"
         → Content saturation ≥ 6% → "habitat"
      3. Otherwise → null (unrecognized)
  → Vote across frames → winner by count
  → Confidence: high (≥5 votes), medium (≥3), low (<3)
  → Fallback: "all" mode if no frames classified
```

Measured thresholds: Pokémon sat 0.0–2.6%, Habitat sat 12.4–33.9%, threshold at 6% (wide margin).

---

## 3. Key Files & Responsibilities

### Entry Points & Config
| File | Purpose |
|---|---|
| `index.html` | SPA shell, Google Consent Mode v2 defaults, GA/AdSense script tags |
| `src/main.jsx` | React root render (`createRoot` → `<App />`) |
| `vite.config.js` | Vite config: React plugin, TailwindCSS plugin, dynamic `base` path, Vitest config |
| `package.json` | Dependencies, scripts (`dev`, `build`, `lint`, `preview`, `test`) |
| `eslint.config.js` | ESLint 9 flat config with React hooks/refresh plugins |
| `.env.example` | Template for env vars (ad provider, Adsterra/AdSense keys, GA ID, base path) |

### Source — Components (`src/components/`)
| File | LOC~ | Purpose |
|---|---|---|
| `App.jsx` | 300 | Root component: page state, hash routing, session management, lazy loading |
| `LandingPage.jsx` | 350 | Video upload (drag-drop), per-video scan mode selector, settings (debug-only), import/export, session history |
| `VideoScanner.jsx` | 400 | Multi-video scan orchestrator: auto-detection → scanning → progress display. Max 3 concurrent scans |
| `ScanResults.jsx` | 400 | Results display: category tabs, search/filter, grid/list view, export JSON, copy to clipboard |
| `CategoryCard.jsx` | 50 | Single category progress card (found/total + progress bar) |
| `ProgressBar.jsx` | 40 | DaisyUI progress bar wrapper with label, percent, size, color |
| `ErrorBoundary.jsx` | 30 | React error boundary with fallback UI |
| `CookieConsent.jsx` | 80 | GDPR consent banner, Google Consent Mode v2 integration |
| `AdBanner.jsx` | 180 | Adsterra/AdSense ad rendering (consent-gated, provider auto-detect) |
| `HowToGuide.jsx` | 180 | Step-by-step usage guide (record → transfer → upload → scan → export) |
| `PrivacyPolicy.jsx` | 200 | Privacy policy page |
| `TermsConditions.jsx` | 180 | Terms & conditions page |

### Source — Utils (`src/utils/`)
| File | LOC | Purpose |
|---|---|---|
| `ocrEngine.js` | 1396 | Core OCR pipeline: frame extraction, preprocessing, Tesseract worker pool, text matching, scan orchestration, result merging |
| `gridEngine.js` | 1070 | Grid-based scanner: 4 scan modes, icon fingerprint matching, scroll tracking, tile classification |
| `fuzzyMatch.js` | 153 | Levenshtein distance + prefix-indexed fuzzy matcher |
| `scanStorage.js` | 167 | localStorage CRUD for scan sessions (save/load/list/delete/merge, 4MB limit, 20 session cap) |
| `videoDetector.js` | 317 | Auto-detect video type via frame sampling + pixel heuristics |

### Source — Assets (`src/assets/`)
| File | Purpose |
|---|---|
| `pokopiaDataset.json` | Full dataset: metadata + arrays of pokemon/items/habitats/recipes with names, numbers, categories |
| `ocrLookup.json` | OCR dictionary: 1746 entries mapping item names → `{type, category, number}` |
| `iconFingerprints.json` | Icon fingerprint database: `{size, scale, fingerprints: {name: [16×16 pixel array]}}` |

### Public Assets (`public/icons/`)
| Directory | Contents |
|---|---|
| `items/icon_map.json` | 1302 entries mapping item name → icon path (e.g., `"Leppa Berry": "dream_ui/leppa-berry.webp"`) |
| `items/item_ui/` | ~1023 item icon images (.webp) |
| `items/dream_ui/` | 11 dream item icons |
| `items/shop_ui/` | ~76 shop item icons |
| `items/crafting_ui/` | ~191 crafting item icons |
| `items/habitat_ui/` | 1 habitat item icon |
| `pokemon/` | ~307 Pokémon icons (.webp) |
| `habitats/` | ~209 habitat icons (.webp) |

### Tests (`src/utils/__tests__/`)
| File | Coverage |
|---|---|
| `fuzzyMatch.test.js` | 6 tests: levenshtein distance, exact/fuzzy/findMatch |
| `scanStorage.test.js` | 7 tests: CRUD operations, quota handling |

### Docs (`docs/`)
| File | Purpose |
|---|---|
| `edge-case-findings.md` | 30 documented edge cases with severity ratings |
| `edge-case-findings.json` | Machine-readable edge case data |
| `test-plan.md` | Risk-based test plan with priority rankings |
| `project-context.md` | This file |

### Deployment & Infrastructure
| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | GitHub Actions: build → upload → deploy to GitHub Pages |
| `Dockerfile` | Multi-stage: node:20-alpine build → nginx serve |
| `docker-compose.yml` | Docker Compose with build args for all VITE_* env vars |
| `nginx.conf` | Caching strategy, gzip, SPA fallback, security headers |

---

## 4. Data Model

### 4.1 pokopiaDataset.json
```json
{
  "metadata": {
    "source": "pokopiadex.com",
    "scrapedAt": "...",
    "counts": { "pokemon": 300, "items": 1254, "habitats": 209, "recipes": 743 }
  },
  "pokemon": [{ "name": "...", "number": "#001", "types": [...], ... }],
  "items": [{ "name": "...", "category": "...", ... }],
  "habitats": [{ "name": "...", "number": "1", ... }],
  "recipes": [{ "name": "...", "category": "...", ... }]
}
```

### 4.2 ocrLookup.json
```json
{
  "Pikachu": { "type": "pokemon", "number": "#025", "name": "Pikachu" },
  "Tall Grass": { "type": "habitat", "number": "1", "name": "Tall Grass" },
  "Potion": { "type": "item", "category": "Medicine", "name": "Potion" },
  "Berry Smoothie": { "type": "recipe", "category": "Drinks", "name": "Berry Smoothie" }
}
```
Total: 1746 entries. Keys are display names (mixed case). Values include `type`, `category`, `number`, `name`.

### 4.3 iconFingerprints.json
```json
{
  "size": 16,
  "scale": 1,
  "fingerprints": {
    "Item Name": [/* 256 quantized pixel values (16×16 grayscale) */]
  }
}
```
Total: 1302 fingerprints. Used by gridEngine for dot-product matching against extracted tile fingerprints. Pre-loaded into `Float32Array` for SIMD-friendly computation.

### 4.4 icon_map.json
```json
{
  "Leppa Berry": "dream_ui/leppa-berry.webp",
  "Chesto Berry": "item_ui/chesto-berry.webp"
}
```
Total: 1302 entries. Maps item name → relative icon path under `public/icons/items/`.

### 4.5 Scan Results Shape (returned by `scanVideo()`)
```typescript
{
  scanDate: string,          // ISO timestamp
  totalFound: number,        // sum of all category found counts
  pokemon: {
    found: number,
    total: number,           // 300
    items: Array<{
      name: string,
      number: string,        // "#025"
      type: "pokemon",
      captured?: boolean,    // true = captured, false = sensed only
      confidence?: number
    }>
  },
  items: {
    found: number,
    total: number,           // 1254
    items: Array<{
      name: string,
      type: "item",
      category?: string,
      discovered?: boolean,
      confidence?: number
    }>
  },
  habitats: {
    found: number,
    total: number,           // 209
    items: Array<{
      name: string,
      number?: string,
      type: "habitat",
      built?: boolean,       // true = built, false = not built
      confidence?: number
    }>
  },
  recipes: {
    found: number,
    total: number,           // 743
    items: Array<{
      name: string,
      type: "recipe",
      category?: string,
      discovered?: boolean,
      confidence?: number
    }>
  }
}
```

### 4.6 Session Storage Shape (scanStorage.js)

**Session list** (`localStorage['pokopia-scan-sessions']`):
```json
[
  {
    "id": "uuid",
    "date": "ISO string",
    "totalFound": 42,
    "scanCount": 3,
    "categories": { "pokemon": 10, "items": 20, "habitats": 5, "recipes": 7 }
  }
]
```
Max 20 sessions. Sorted newest first.

**Session data** (`localStorage['pokopia-current-session-{id}']`):
```json
{
  "results": { /* full scan results shape above */ },
  "scanCount": 3,
  "savedAt": "ISO string"
}
```
Max payload: 4MB. Returns `'QUOTA_EXCEEDED'` if exceeded.

---

## 5. Critical Implementation Patterns

### 5.1 Dynamic Imports for JSON Assets
All large JSON assets are lazy-loaded on first scan to reduce initial bundle:
```javascript
// ocrEngine.js
async function ensureOcrData() {
  if (_ocrLookup) return;
  const [lookupMod, datasetMod] = await Promise.all([
    import('../assets/ocrLookup.json'),
    import('../assets/pokopiaDataset.json'),
  ]);
  _ocrLookup = lookupMod.default;
  // ...
}

// gridEngine.js
async function ensureGridData() {
  if (_pokopiaDataset) return;
  const [dsMod, fpMod] = await Promise.all([
    import('../assets/pokopiaDataset.json'),
    import('../assets/iconFingerprints.json'),
  ]);
  // ...
}
```

### 5.2 Worker Pool Management
```javascript
async function createWorkerPool(poolSize, ocrParams = null) {
  const workers = await Promise.all(
    Array.from({ length: poolSize }, async () => {
      const w = await createWorker('eng', 1, { logger: () => {} });
      if (ocrParams) await w.setParameters(ocrParams);
      return w;
    })
  );
  return workers;
}

async function terminateWorkerPool(workers) {
  await Promise.all(workers.map(w => w.terminate()));
}
```
Pool size auto-detected. Reduced on mobile (`/iPhone|iPad|iPod|Android/i`).

### 5.3 Frame Extraction & Preprocessing
```javascript
function extractFrameToCanvas(video, cropRegion, mode = 'standard') {
  // 1. Draw video frame to canvas
  // 2. Apply crop region (percentage-based)
  // 3. Preprocess: grayscale → threshold at 128 → artifact removal
  // Returns: HTMLCanvasElement
}
```

### 5.4 Grid Detection — Fingerprint Matching
```javascript
// Pre-process: fpVectors = Float32Array(fpNames.length * FP_SIZE * FP_SIZE)
// Per tile: extract 16×16 fingerprint → normalize → dot product against all fpVectors
// Best match above MIN_MATCH_SCORE (0.65) wins
```

### 5.5 Grid Detection — Scroll Tracking
- **Item/Recipe**: D/U row-pattern tracking (discovered/undiscovered row markers)
- **Pokémon/Habitat**: Pixel cross-correlation of vertical profile strips between consecutive frames. Correlation above `XCORR_MIN_CORR` threshold → compute shift in pixels → update absolute row offset.

### 5.6 Fuzzy Matching with Levenshtein Distance
```javascript
// buildFuzzyMatcher(ocrLookup) returns:
//   .exactMatch(text)     — case-insensitive O(n) scan
//   .fuzzyMatch(text, maxDistance) — prefix-indexed candidates first, full scan fallback
//   .findMatch(text, maxDistance)  — exact first, then fuzzy
```

### 5.7 Category Detection (Auto-Detect vs Forced)
- User can set per-video scan mode: `auto`, `pokemon`, `habitat`, `item`, `recipe`
- `auto` → `videoDetector.detectVideoType()` samples 8 frames, classifies by pixel heuristics
- Forced mode skips detection, routes directly to appropriate pipeline
- `all` mode in ocrEngine runs OCR text matching for all categories simultaneously

### 5.8 Hash-Based SPA Routing
```javascript
const HASH_TO_PAGE = {
  '#/privacy': 'privacy',
  '#/terms': 'terms',
  '#/how-to': 'howto',
};
// hashchange listener syncs page state
// Non-routable pages (landing, scanning, results) use history.pushState to clear hash
```

### 5.9 Result Merging
```javascript
export function mergeResults(existing, incoming) {
  // Per category: merge by name, upgrade statuses (true wins over false/null)
  // captured, built, discovered flags only upgrade to true, never downgrade
  // Higher confidence values preserved
}
```

### 5.10 Code Splitting
Lazy-loaded via `React.lazy()` + `<Suspense>`:
- `VideoScanner`, `ScanResults`, `PrivacyPolicy`, `TermsConditions`, `HowToGuide`
- Eagerly loaded: `LandingPage`, `CookieConsent`, `AdBanner`, `ErrorBoundary`

---

## 6. Configuration & Environment

### 6.1 Vite Environment Variables
| Variable | Purpose | Required |
|---|---|---|
| `VITE_BASE_PATH` | Base URL path (default `/`, set to `/Pokopiascanner/` for GH Pages/Docker) | Yes for deploy |
| `VITE_AD_PROVIDER` | `'adsense'`, `'adsterra'`, or empty (auto-detect) | No |
| `VITE_ADSTERRA_DESKTOP_KEY` | Adsterra desktop banner key | No |
| `VITE_ADSTERRA_MOBILE_KEY` | Adsterra mobile banner key | No |
| `VITE_ADSENSE_CLIENT` | Google AdSense client ID | No |
| `VITE_AD_SLOT_LANDING_TOP` | AdSense slot ID for landing page top | No |
| `VITE_AD_SLOT_LANDING_BOTTOM` | AdSense slot ID for landing page bottom | No |
| `VITE_AD_SLOT_SCANNER_TOP` | AdSense slot ID for scanner page top | No |
| `VITE_AD_SLOT_SCANNER_BOTTOM` | AdSense slot ID for scanner page bottom | No |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics 4 measurement ID | No |

### 6.2 Build Commands
```bash
npm run dev      # Vite dev server (HMR)
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # ESLint
npm run test     # Vitest (run once)
```

### 6.3 GitHub Actions Pipeline (`.github/workflows/deploy.yml`)
```
push to main → checkout → setup node 20 → npm ci → npm run build (with secrets) → upload artifact → deploy to GitHub Pages
```
All `VITE_*` vars injected from GitHub Secrets at build time.

### 6.4 Docker Build
```dockerfile
# Stage 1: node:20-alpine → npm ci → npm run build (with ARGs)
# Stage 2: nginx:alpine → copy dist → copy nginx.conf
```

### 6.5 nginx.conf Cache Strategy
| Path | Cache | Rationale |
|---|---|---|
| `/assets/` | 1 year, immutable | Vite content-hashes filenames |
| `/icons/` | 30 days | Stable filenames, content doesn't change |
| `/favicon.svg` | 1 day | Infrequent changes |
| `/ads.txt`, `/robots.txt` | 1 hour client, 1 day CDN | Moderate refresh |
| `/` (index.html) | no-cache, no-store | New deploys picked up immediately |
| SPA fallback | `try_files $uri $uri/ /index.html` | Hash routing support |

### 6.6 Debug Mode
Activated via URL query parameter: `?debug=true`
- Shows advanced scanner settings on LandingPage (scan mode, crop region, frame interval, confidence, fuzzy tolerance)
- Shows detailed item browser tabs on ScanResults
- Shows debug info in VideoScanner

---

## 7. Known Issues & Technical Debt

### 7.1 Edge Cases (30 findings in `docs/edge-case-findings.md`)

**🔴 High severity (crash/hang risk)**:
- `ocrEngine.js:661,676` — Worker pool creation/termination leaks (use `Promise.allSettled`)
- `ocrEngine.js:130` — FPS near 0 → Infinity fps → `frameIntervalMs=0` → infinite loop
- `ocrEngine.js:501` — `_matcher` may be null during habitat scanning
- `ocrEngine.js:1035` — `getContext('2d')` returns null → TypeError crash
- `gridEngine.js:342` — `normalizeProfile` division by zero on empty profile → NaN propagation
- `gridEngine.js:320` — OOB pixel reads (yEnd exceeds height, negative stripX)
- `gridEngine.js:396` — OOB in `extractTileFingerprint`
- `gridEngine.js:590` — `frameIntervalMs=0` → infinite loop
- `gridEngine.js:598` — Canvas context null → crash

**🟡 Medium severity (silent wrong results)**:
- `gridEngine.js:44` — NaN from malformed dataset numbers → unstable sort
- `gridEngine.js:82` — Zero video dimensions → zero-size grid params
- `gridEngine.js:569` — Seek timeout → wrong-frame processing
- `gridEngine.js:1053` — `getGridDataList` called before `ensureGridData`

### 7.2 Test Coverage
| Module | Risk Score | Tests | Status |
|---|---|---|---|
| ocrEngine.js | 25 (CRITICAL) | 0 | ❌ Untested |
| gridEngine.js | 25 (CRITICAL) | 0 | ❌ Untested |
| videoDetector.js | 12 (HIGH) | 0 | ❌ Untested |
| VideoScanner.jsx | 12 (HIGH) | 0 | ❌ Untested |
| fuzzyMatch.js | 6 | 6 | ✅ Good |
| scanStorage.js | 4 | 7 | ✅ Good |

See `docs/test-plan.md` for full risk-based test plan.

### 7.3 Bundle Size
- Large JSON assets (pokopiaDataset, ocrLookup, iconFingerprints) are lazy-loaded but still significant
- 1302 icon images in `public/icons/` add to total deployment size
- Tesseract.js English language pack loaded at runtime

### 7.4 Other Debt
- No E2E tests
- No visual regression tests
- CSS files per component are mostly empty (27 bytes each — just placeholder imports)
- `mergeCategory` uses `Promise.all` for worker termination (should be `Promise.allSettled`)
- No service worker / offline support
- No PWA manifest

---

## 8. Conventions & Rules

### 8.1 Commit Messages
Conventional commits: `feat:`, `fix:`, `style:`, `ci:`, `docs:`, `refactor:`, `test:`, `chore:`

### 8.2 File Naming
- Components: PascalCase (e.g., `VideoScanner.jsx`)
- Utils: camelCase (e.g., `ocrEngine.js`)
- CSS: matches component name (e.g., `VideoScanner.css`)
- Assets: camelCase (e.g., `pokopiaDataset.json`)
- No spaces in filenames

### 8.3 CSS Approach
- TailwindCSS 4.2 via `@tailwindcss/vite` plugin (no `tailwind.config.js` — uses CSS-first config)
- DaisyUI 5.5 via `@plugin 'daisyui'` in `index.css` (dark theme default)
- Per-component `.css` files exist but are mostly empty placeholders
- Inline Tailwind classes preferred for all styling

### 8.4 JavaScript Patterns
- ES modules (`"type": "module"` in package.json)
- Functional React components with hooks (no class components)
- `useCallback` for all handler functions passed as props
- `useMemo` for expensive computations (filtered items)
- `useRef` for DOM references and mutable values
- `useEffect` for side effects (localStorage sync, hash routing)
- No TypeScript (plain JSX)

### 8.5 Git Workflow
- Push to `main` → auto-deploy to GitHub Pages
- No branch protection or PR requirements currently
- Use `GH_ACCESS_TOKEN` for push authentication from Agent Zero

### 8.6 Export Pattern
- Utils export named functions (`export function`, `export const`)
- Components use default exports (`export default function`)
- JSON assets accessed via dynamic `import()` with `.default`

### 8.7 Error Handling
- `ErrorBoundary` wraps main content area
- `try/catch` in localStorage operations with graceful fallbacks
- Worker pool termination in finally blocks
- AbortController signal support for scan cancellation
- Timeout wrappers for video operations (FPS detection, frame extraction, type detection)
