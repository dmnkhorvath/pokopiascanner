# Pokopia Scanner — Non-Functional Requirements Assessment

**Date**: 2026-04-03  
**Assessor**: Test Architect (Agent)  
**Project**: Pokopia Progress Scanner  
**Stack**: Vite 6 + React 18.3.1 + Tesseract.js 5.1.1 + TailwindCSS 4.2 + DaisyUI 5.5  
**Deployment**: GitHub Pages (static) / Docker + nginx (containerized)  
**Test Baseline**: 146 Vitest tests, all passing (825ms execution)  

---

## Table of Contents

1. [Performance](#1-performance)
2. [Security](#2-security)
3. [Accessibility](#3-accessibility-a11y)
4. [Reliability](#4-reliability)
5. [Scalability](#5-scalability)
6. [Usability](#6-usability)
7. [Summary Matrix](#7-summary-matrix)
8. [Priority Action Plan](#8-priority-action-plan)

---

## 1. Performance

### Current State Assessment: 3 / 5 — Moderate gaps

### Evidence

#### Bundle Analysis (Vite production build)

| Asset | Raw Size | Gzip Size | Type |
|---|---|---|---|
| `index.html` | 2.53 KB | 1.01 KB | Entry |
| `index-CO-Hosvu.css` | 86.22 KB | 14.90 KB | Styles (TailwindCSS + DaisyUI) |
| `index-B5kx9Vyn.js` | 223.54 KB | 72.45 KB | Main bundle (React + app code) |
| `pokopiaDataset-*.js` | 126.74 KB | 20.68 KB | Lazy data |
| `ocrLookup-*.js` | 135.56 KB | 25.06 KB | Lazy data |
| `iconFingerprints-*.js` | **1,519.58 KB** | **447.35 KB** | Lazy data ⚠️ |
| `ScanResults-*.js` | 14.59 KB | 4.41 KB | Lazy component |
| `VideoScanner-*.js` | 12.72 KB | 4.96 KB | Lazy component |
| Other lazy components | ~24 KB | ~9 KB | Lazy components |

**Total initial load** (HTML + CSS + main JS): ~312 KB raw / ~88 KB gzip  
**Total with all lazy assets**: ~2,145 KB raw / ~601 KB gzip  

#### Code Splitting (Good)
- 6 components lazy-loaded via `React.lazy()` + `<Suspense>`: VideoScanner, ScanResults, PrivacyPolicy, TermsConditions, HowToGuide, RecordingGuide
- 3 JSON data assets dynamically imported on first scan: pokopiaDataset, ocrLookup, iconFingerprints
- Eagerly loaded: LandingPage, CookieConsent, AdBanner, ErrorBoundary

#### OCR Scan Performance
- Worker pool auto-sized: `Math.min(hardwareConcurrency, maxWorkers, floor(frames/2))`
- Mobile cap: 4 workers; Desktop cap: 8 workers
- Batch processing: `poolSize * 4` frames per batch to bound memory
- `yieldToBrowser()` calls every 2 frames during extraction for UI responsiveness
- Frame deduplication logic exists but is **disabled** (`enableDedup = false`)

#### Rendering Performance
- ScanResults uses `useMemo` for filtered items — good
- **No list virtualization**: All filtered items rendered via `.map()` — up to 1,254 items (Items category) rendered as DOM nodes simultaneously
- CSS-only ring charts (conic-gradient) — no canvas/SVG overhead
- Combined detection feed capped at 50 items (`slice(0, 50)`)
- Recent items per video capped at 30 (`slice(0, 30)`)

### Gaps

| ID | Gap | Impact | Effort |
|---|---|---|---|
| P-1 | `iconFingerprints.json` is 1.5 MB raw / 447 KB gzip — exceeds Vite's 500 KB chunk warning | Slow first scan start on mobile/slow connections | High |
| P-2 | No list virtualization in ScanResults — 1,254 items rendered as full DOM | Jank on low-end devices when viewing Items tab | Medium |
| P-3 | Frame deduplication disabled — extra OCR calls on duplicate frames | Slower scans, wasted CPU cycles | Low |
| P-4 | Main bundle at 223 KB includes React + all eagerly-loaded components | Could be split further with manual chunks | Low |
| P-5 | No `loading="lazy"` on item icon images in ScanResults grid view | All icons load immediately even if off-screen | Medium |

### Recommendations

| Priority | Action | Expected Impact | Effort |
|---|---|---|---|
| 🔴 High | Compress `iconFingerprints.json` — consider binary format (e.g., MessagePack), reduce fingerprint resolution, or split by category | Reduce 447 KB gzip to ~100-200 KB | High |
| 🟠 Medium | Add virtual scrolling to ScanResults (e.g., `react-window` or `@tanstack/virtual`) for lists >100 items | Eliminate DOM bloat, smooth scrolling on mobile | Medium |
| 🟠 Medium | Add `loading="lazy"` attribute to `<img>` tags in ScanResults grid view | Reduce initial image load by ~80% | Low |
| 🟡 Low | Re-enable frame deduplication with tuned thresholds once detection accuracy is confirmed | 20-40% fewer OCR calls on slow-scrolling videos | Low |
| 🟡 Low | Split main bundle: separate React vendor chunk via `manualChunks` in Vite config | Improve cache hit rate on app updates | Low |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| Initial page load (gzip) | ~88 KB | < 100 KB ✅ |
| Largest lazy chunk (gzip) | 447 KB (iconFingerprints) | < 200 KB |
| Time to Interactive (3G) | ~3-4s estimated | < 3s |
| ScanResults render (1000+ items) | No virtualization | < 16ms frame budget (60fps) |
| Scan throughput (desktop) | ~50 fps extraction | Maintain ≥ 30 fps |

---

## 2. Security

### Current State Assessment: 3 / 5 — Good foundation, key gaps

### Evidence

#### Dependency Audit
```
npm audit: found 0 vulnerabilities ✅
```

#### Security Headers (nginx.conf)
| Header | Status | Value |
|---|---|---|
| `X-Frame-Options` | ✅ Present | `SAMEORIGIN` |
| `X-Content-Type-Options` | ✅ Present | `nosniff` |
| `Referrer-Policy` | ✅ Present | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | ✅ Present | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | ❌ **Missing** | — |
| `Strict-Transport-Security` | ❌ **Missing** | — |

#### Ad Script Injection Protection
- Adsterra key validated with regex: `/^[a-f0-9]+$/` before script injection ✅
- Ad scripts loaded only after cookie consent ✅
- No `dangerouslySetInnerHTML` usage ✅
- Script injection via `document.createElement('script')` with validated key — acceptable pattern

#### Data Handling
- All processing is 100% client-side — no data leaves the browser ✅
- No sensitive data stored (only scan results in localStorage)
- No authentication/authorization needed (static site)
- Google Consent Mode v2 defaults to all-denied until explicit accept ✅

#### GitHub Pages Deployment
- No server-side headers configurable on GitHub Pages — CSP/HSTS not applicable there
- nginx.conf only applies to Docker deployment

### Gaps

| ID | Gap | Impact | Effort |
|---|---|---|---|
| S-1 | No Content-Security-Policy header in nginx.conf | XSS risk from injected scripts; ad networks load arbitrary JS | Medium |
| S-2 | No `Strict-Transport-Security` (HSTS) header | Downgrade attacks possible on Docker deployment | Low |
| S-3 | `index.html` loads Google Analytics and AdSense scripts unconditionally (before consent check) | Scripts loaded even if user rejects cookies — only data collection is gated | Medium |
| S-4 | Ad script `container.innerHTML = ''` clears container — minor DOM manipulation risk | Low risk since key is validated | Low |
| S-5 | No Subresource Integrity (SRI) on third-party scripts (GA, AdSense) | Supply chain attack vector | Low |

### Recommendations

| Priority | Action | Expected Impact | Effort |
|---|---|---|---|
| 🔴 High | Add CSP header to nginx.conf: `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://pagead2.googlesyndication.com https://www.highperformanceformat.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com;` | Block unauthorized script execution | Medium |
| 🟠 Medium | Add HSTS header: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` | Prevent protocol downgrade | Low |
| 🟠 Medium | Defer GA/AdSense script loading until after consent is granted (move `<script>` tags from `index.html` to dynamic injection in `CookieConsent.jsx`) | True consent-first loading; smaller initial HTML | Medium |
| 🟡 Low | Add SRI hashes to third-party script tags | Detect tampered CDN scripts | Low |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| npm audit vulnerabilities | 0 | 0 ✅ |
| Security headers (nginx) | 4/6 | 6/6 |
| CSP header | Missing | Present with allowlist |
| Third-party scripts before consent | 2 (GA + AdSense) | 0 |
| `dangerouslySetInnerHTML` usage | 0 | 0 ✅ |

---

## 3. Accessibility (a11y)

### Current State Assessment: 2 / 5 — Significant gaps

### Evidence

#### What's Done Well
- Cookie consent banner: `role="dialog"`, `aria-label="Cookie consent"` ✅
- Upload drop zone: `role="button"`, `tabIndex={0}`, `aria-label="Upload video files..."` ✅
- Upload drop zone: keyboard handler for Enter/Space ✅
- CategoryCard: `role="button"`, `tabIndex={0}` ✅
- Custom crop sliders: `aria-label` on each range input ✅
- `<html lang="en">` set in index.html ✅
- Semantic HTML: `<main>`, `<section>`, `<h1>`-`<h3>` hierarchy ✅

#### What's Missing

| Area | Finding |
|---|---|
| **Skip navigation** | No skip-to-content link — keyboard users must tab through header/nav |
| **Focus management** | No focus trap in cookie consent dialog; no focus restoration on page transitions |
| **Live regions** | No `aria-live` on scan progress updates — screen readers won't announce progress changes |
| **Alt text** | Item/Pokémon/habitat icon images in ScanResults likely missing `alt` attributes |
| **Color contrast** | DaisyUI dark theme used — `base-content/60` (60% opacity text) may fail WCAG AA 4.5:1 ratio |
| **Form labels** | Search input in ScanResults may lack associated `<label>` or `aria-label` |
| **Heading hierarchy** | Generally good but not audited for skip levels |
| **Keyboard navigation** | CategoryCard has `tabIndex` but no `onKeyDown` handler for Enter/Space activation |
| **Screen reader announcements** | Scan completion, errors, and result counts not announced |
| **Reduced motion** | No `prefers-reduced-motion` media query — loading spinners always animate |

### Gaps

| ID | Gap | WCAG Criterion | Impact | Effort |
|---|---|---|---|---|
| A-1 | No skip navigation link | 2.4.1 Bypass Blocks (A) | Keyboard users can't skip to main content | Low |
| A-2 | No `aria-live` regions for scan progress | 4.1.3 Status Messages (AA) | Screen readers miss real-time scan updates | Medium |
| A-3 | Missing alt text on result icons | 1.1.1 Non-text Content (A) | Images meaningless to screen readers | Low |
| A-4 | Cookie consent dialog not focus-trapped | 2.4.3 Focus Order (A) | Tab can escape dialog to background content | Medium |
| A-5 | CategoryCard missing keyboard activation | 2.1.1 Keyboard (A) | Can focus but not activate via keyboard | Low |
| A-6 | Low-opacity text (`/60`) may fail contrast | 1.4.3 Contrast Minimum (AA) | Text unreadable for low-vision users | Medium |
| A-7 | No `prefers-reduced-motion` support | 2.3.3 Animation from Interactions (AAA) | Vestibular disorder users affected | Low |
| A-8 | No focus management on page transitions | 2.4.3 Focus Order (A) | Focus lost when navigating between pages | Medium |

### Recommendations

| Priority | Action | WCAG | Effort |
|---|---|---|---|
| 🔴 High | Add skip-to-content link: `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` | 2.4.1 (A) | Low |
| 🔴 High | Add `aria-live="polite"` region for scan progress messages and result counts | 4.1.3 (AA) | Medium |
| 🔴 High | Add `alt` attributes to all `<img>` tags in ScanResults (item name as alt text) | 1.1.1 (A) | Low |
| 🟠 Medium | Implement focus trap in CookieConsent dialog (trap Tab within Accept/Reject buttons) | 2.4.3 (A) | Medium |
| 🟠 Medium | Add `onKeyDown` to CategoryCard: activate on Enter/Space | 2.1.1 (A) | Low |
| 🟠 Medium | Audit and fix color contrast — replace `/60` opacity with WCAG-compliant colors | 1.4.3 (AA) | Medium |
| 🟡 Low | Add `prefers-reduced-motion` media query to disable animations | 2.3.3 (AAA) | Low |
| 🟡 Low | Manage focus on page transitions — focus `<main>` or `<h1>` after navigation | 2.4.3 (A) | Medium |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| WCAG 2.1 Level A violations | ~5 | 0 |
| WCAG 2.1 Level AA violations | ~3 | 0 |
| Skip navigation link | Missing | Present |
| `aria-live` regions | 0 | ≥ 2 (progress + results) |
| Images with alt text | Partial | 100% |
| Keyboard-navigable interactive elements | ~70% | 100% |

---

## 4. Reliability

### Current State Assessment: 4 / 5 — Strong foundation

### Evidence

#### Error Handling Architecture
- **ErrorBoundary**: Wraps `<main>` content area — catches React render errors with friendly fallback UI and reload button ✅
- **localStorage operations**: All wrapped in `try/catch` with graceful fallbacks (return `[]`, `null`, etc.) ✅
- **Worker pool termination**: `terminateWorkerPool()` called in cleanup paths ✅
- **AbortController**: Full support for scan cancellation — signal checked in OCR loop, grid engine checks `signal?.aborted` at each frame ✅
- **Timeout wrappers**: FPS detection (5s timeout), video type detection, frame extraction all have timeout guards ✅
- **Quota handling**: `saveSession()` returns `'QUOTA_EXCEEDED'` on oversized payloads (>4MB) or `QuotaExceededError` ✅
- **JSON parse safety**: Import handlers wrap `JSON.parse` in `try/catch` with user-facing `alert()` ✅

#### Edge Case Coverage
- **30 documented edge cases** in `docs/edge-case-findings.md`
- Severity breakdown: 🔴 High (can crash pipeline), 🟡 Medium (silent wrong results), 🟢 Low (minor/unlikely)
- Guard implementations tracked per finding

#### Test Coverage
- 146 tests across 6 utility modules, all passing
- Test quality score: 86/100 (per test-quality-review.md)
- Coverage gaps: No component tests, no E2E tests, no visual regression tests

### Gaps

| ID | Gap | Impact | Effort |
|---|---|---|---|
| R-1 | No service worker / offline support | App fails completely when offline — no cached shell | High |
| R-2 | No PWA manifest | Can't install as app; no offline indicator | Low |
| R-3 | Worker termination uses `Promise.all` instead of `Promise.allSettled` | If one worker fails to terminate, others leak | Low |
| R-4 | No browser compatibility declaration / browserslist config | Unknown which browsers are supported | Low |
| R-5 | `alert()` used for error messages (JSON parse failures) | Blocks UI thread; poor UX | Low |
| R-6 | ErrorBoundary doesn't report errors to any monitoring service | Errors invisible in production | Medium |
| R-7 | No component-level error boundaries (only one global) | Single component error takes down entire app view | Medium |

### Recommendations

| Priority | Action | Expected Impact | Effort |
|---|---|---|---|
| 🟠 Medium | Add PWA manifest + basic service worker for app shell caching | Installable app; graceful offline message | Medium |
| 🟠 Medium | Replace `Promise.all` with `Promise.allSettled` in worker termination (`mergeCategory`) | Prevent worker leaks on partial termination failure | Low |
| 🟠 Medium | Add component-level error boundaries around VideoScanner and ScanResults | Isolate scan failures from results view | Low |
| 🟡 Low | Add `browserslist` to `package.json` (e.g., `"> 0.5%, last 2 versions, not dead"`) | Clear browser support contract | Low |
| 🟡 Low | Replace `alert()` calls with DaisyUI toast/alert components | Non-blocking, styled error messages | Low |
| 🟡 Low | Add lightweight error reporting (e.g., log to console + optional beacon to analytics) | Visibility into production errors | Medium |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| Error boundaries | 1 (global) | 3+ (global + per-feature) |
| Worker termination safety | `Promise.all` | `Promise.allSettled` |
| Offline behavior | White screen | Cached shell + "offline" message |
| Browser support declaration | None | Explicit browserslist |
| Blocking `alert()` calls | 2+ | 0 |
| Edge cases documented | 30 | 30 ✅ |
| Test pass rate | 100% (146/146) | 100% ✅ |

---

## 5. Scalability

### Current State Assessment: 3 / 5 — Adequate for current scope, limits approaching

### Evidence

#### Data Volume Handling
- **Dataset totals**: 300 Pokémon, 1,254 Items, 209 Habitats, 743 Recipes
- **ScanResults rendering**: All items in active category rendered via `.map()` — no pagination or virtualization
- **Filtering**: `useMemo` with dependencies on activeTab, searchQuery, and filter states — recomputes on every filter change
- **Combined detection feed**: Capped at 50 items ✅
- **Per-video recent items**: Capped at 30 items ✅

#### Storage Limits
- **localStorage session cap**: 20 sessions maximum ✅
- **Payload size guard**: 4 MB per session, returns `'QUOTA_EXCEEDED'` ✅
- **Session eviction**: Oldest sessions evicted when cap exceeded, associated data cleaned up ✅
- **Total localStorage budget**: Browser-dependent (~5-10 MB typical) — with 20 sessions × up to 4 MB each, could exceed quota

#### Concurrent Operations
- **Worker pool**: Auto-sized based on `navigator.hardwareConcurrency`, capped at 4 (mobile) / 8 (desktop)
- **Batch processing**: `poolSize * 4` frames per batch — bounds memory
- **Max concurrent video scans**: 3 (hardcoded in VideoScanner)
- **Memory pressure**: Canvas elements created per frame, but batched processing limits accumulation

#### JSON Asset Sizes
| Asset | Raw Size | In-Memory (parsed) |
|---|---|---|
| `pokopiaDataset.json` | 192 KB | ~500 KB estimated |
| `ocrLookup.json` | 180 KB | ~400 KB estimated |
| `iconFingerprints.json` | 1.5 MB | ~4-6 MB estimated |

### Gaps

| ID | Gap | Impact | Effort |
|---|---|---|---|
| SC-1 | No list virtualization — 1,254 items rendered as DOM nodes | Memory + rendering bottleneck on Items tab | Medium |
| SC-2 | `iconFingerprints.json` ~4-6 MB in memory after parse | Significant memory pressure on mobile devices | High |
| SC-3 | 20 sessions × 4 MB = 80 MB theoretical max exceeds localStorage quota | Sessions silently fail to save after quota exceeded | Low |
| SC-4 | No Web Worker for JSON parsing — large assets parsed on main thread | UI freeze during first scan initialization | Medium |
| SC-5 | Canvas elements not explicitly released (`canvas.width = 0`) after batch processing | Potential GPU memory accumulation | Low |

### Recommendations

| Priority | Action | Expected Impact | Effort |
|---|---|---|---|
| 🟠 Medium | Add virtual scrolling for ScanResults lists > 100 items | Constant DOM size regardless of result count | Medium |
| 🟠 Medium | Implement progressive loading for iconFingerprints — load per-category on demand | Reduce initial memory from ~5 MB to ~1 MB | High |
| 🟡 Low | Add total localStorage usage tracking and warn user before quota is reached | Prevent silent save failures | Low |
| 🟡 Low | Explicitly release canvas resources after batch processing (`canvas.width = canvas.height = 0`) | Free GPU memory promptly | Low |
| 🟡 Low | Consider IndexedDB for session storage (higher quota, async API) | Remove 5-10 MB localStorage ceiling | Medium |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| Max DOM nodes in ScanResults | ~1,254 (Items tab) | < 50 (virtualized viewport) |
| Memory usage (idle, after scan) | ~10-15 MB estimated | < 10 MB |
| localStorage quota handling | Returns 'QUOTA_EXCEEDED' | Proactive warning + graceful degradation |
| Session storage limit | 20 × 4 MB (localStorage) | Consider IndexedDB migration |
| Canvas memory cleanup | Implicit GC | Explicit release after batch |

---

## 6. Usability

### Current State Assessment: 4 / 5 — Good UX with minor gaps

### Evidence

#### What's Done Well
- **Drag-and-drop upload**: Visual feedback (border color change), keyboard accessible, multi-file support ✅
- **Per-video scan mode selector**: Users can override auto-detection per video ✅
- **Real-time scan progress**: Phase indicators, frame count, percentage, live preview frame, time position ✅
- **Loading states**: `<Suspense>` with spinner fallback for lazy components ✅
- **Category tabs**: Visual progress bars, ring charts, sub-stats (captured/sensed for Pokémon, built/unbuilt for habitats) ✅
- **Search and filter**: Text search + category-specific filters (built, captured, discovered) ✅
- **Grid/List view toggle**: Users choose preferred display mode ✅
- **Export/Import**: JSON export with date-stamped filename, import with merge capability ✅
- **Session history**: View, load, delete past sessions from landing page ✅
- **Scan diff**: "What's New" badge showing items found in latest scan vs previous ✅
- **Recording Guide**: Category-specific instructions with tips and checklist ✅
- **How-To Guide**: Step-by-step usage instructions ✅
- **Responsive ads**: Mobile/desktop breakpoint detection for ad sizing ✅

#### Mobile Responsiveness
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` ✅
- Tailwind responsive classes used throughout (`sm:`, `flex-col sm:flex-row`) ✅
- Ad banner switches between 320×50 (mobile) and 728×90 (desktop) ✅
- Max container width: `max-w-6xl mx-auto px-4` ✅
- Upload area: `max-h-60 overflow-y-auto` for file list ✅

#### Loading & Progress States
- Lazy component loading: DaisyUI spinner (`loading loading-spinner loading-lg`) ✅
- Scan progress: Phase name, frame counter, percentage bar, live preview ✅
- Video detection phase: Status shown per video ✅

### Gaps

| ID | Gap | Impact | Effort |
|---|---|---|---|
| U-1 | `alert()` used for JSON parse errors — blocks UI, unstyled | Jarring UX on import failure | Low |
| U-2 | No skeleton screens — content pops in after lazy load | Perceived performance gap | Medium |
| U-3 | No onboarding / first-time user experience | New users may not understand the workflow | Medium |
| U-4 | Settings panel only visible in debug mode (`?debug=true`) | Power users can't tune OCR without knowing the URL trick | Low |
| U-5 | No confirmation dialog before "Start Fresh" (clears all results) | Accidental data loss | Low |
| U-6 | Error messages are generic ("Something went wrong" in ErrorBoundary) | Users can't self-diagnose issues | Low |
| U-7 | No touch-specific optimizations (swipe between tabs, pinch-to-zoom on results) | Mobile UX could be more native-feeling | Medium |
| U-8 | Copy-to-clipboard button only visible in debug mode | Useful feature hidden from regular users | Low |

### Recommendations

| Priority | Action | Expected Impact | Effort |
|---|---|---|---|
| 🟠 Medium | Replace `alert()` with DaisyUI toast notifications for errors | Non-blocking, styled, auto-dismissing feedback | Low |
| 🟠 Medium | Add confirmation modal before "Start Fresh" action | Prevent accidental data loss | Low |
| 🟡 Low | Add skeleton loading states for ScanResults and VideoScanner | Smoother perceived loading | Medium |
| 🟡 Low | Consider showing basic settings (frame skip, crop region) without debug mode | Empower power users without URL hacking | Low |
| 🟡 Low | Make copy-to-clipboard available to all users (not just debug mode) | Useful for sharing results | Low |
| 🟡 Low | Add a brief onboarding tooltip or first-run overlay | Guide new users through the workflow | Medium |

### Acceptance Criteria

| Metric | Current | Target |
|---|---|---|
| Blocking `alert()` calls | 2+ | 0 |
| Destructive actions with confirmation | 0 | All destructive actions confirmed |
| First-time user guidance | None | Onboarding flow or tooltip |
| Mobile touch targets | Generally adequate (DaisyUI buttons) | ≥ 44×44px per WCAG 2.5.5 |
| Error message helpfulness | Generic | Actionable with recovery steps |

---

## 7. Summary Matrix

| Dimension | Score | Key Strength | Critical Gap |
|---|---|---|---|
| **Performance** | 3/5 | Good code splitting; lazy-loaded components | iconFingerprints 1.5 MB; no list virtualization |
| **Security** | 3/5 | 0 vulnerabilities; validated ad keys; consent-gated | No CSP header; scripts loaded before consent |
| **Accessibility** | 2/5 | Some ARIA attributes; keyboard on upload area | No skip link; no live regions; missing alt text |
| **Reliability** | 4/5 | ErrorBoundary; AbortController; quota handling | No offline support; `Promise.all` in termination |
| **Scalability** | 3/5 | Worker pool auto-sizing; session caps; batch processing | No virtualization; large in-memory JSON assets |
| **Usability** | 4/5 | Rich progress UI; drag-drop; session history; scan diff | `alert()` for errors; no destructive action confirmation |

**Overall NFR Score: 3.2 / 5** — Solid foundation with targeted improvements needed in accessibility and performance.

---

## 8. Priority Action Plan

### Tier 1 — High Impact, Should Fix Soon

| # | Action | Dimension | Effort | Impact |
|---|---|---|---|---|
| 1 | Add skip-to-content link | Accessibility | Low | WCAG 2.4.1 (A) compliance |
| 2 | Add `aria-live` regions for scan progress | Accessibility | Medium | WCAG 4.1.3 (AA) compliance |
| 3 | Add `alt` text to all result icons | Accessibility | Low | WCAG 1.1.1 (A) compliance |
| 4 | Add CSP header to nginx.conf | Security | Medium | Block unauthorized scripts |
| 5 | Defer GA/AdSense loading until consent | Security | Medium | True consent-first architecture |
| 6 | Compress/split iconFingerprints data | Performance | High | Reduce 447 KB gzip payload |

### Tier 2 — Medium Impact, Plan for Next Sprint

| # | Action | Dimension | Effort | Impact |
|---|---|---|---|---|
| 7 | Add virtual scrolling to ScanResults | Performance + Scalability | Medium | Smooth rendering for 1000+ items |
| 8 | Focus trap in cookie consent dialog | Accessibility | Medium | WCAG 2.4.3 (A) compliance |
| 9 | Replace `alert()` with toast notifications | Usability + Reliability | Low | Non-blocking error feedback |
| 10 | Add confirmation for destructive actions | Usability | Low | Prevent accidental data loss |
| 11 | Add HSTS header to nginx.conf | Security | Low | Prevent protocol downgrade |
| 12 | Fix `Promise.all` → `Promise.allSettled` | Reliability | Low | Prevent worker leaks |
| 13 | Add component-level error boundaries | Reliability | Low | Isolate feature failures |

### Tier 3 — Low Impact, Backlog

| # | Action | Dimension | Effort | Impact |
|---|---|---|---|---|
| 14 | Add `loading="lazy"` to result images | Performance | Low | Reduce off-screen image loads |
| 15 | Add `prefers-reduced-motion` support | Accessibility | Low | WCAG 2.3.3 (AAA) |
| 16 | Add PWA manifest + service worker | Reliability | Medium | Offline support + installability |
| 17 | Add browserslist config | Reliability | Low | Clear browser support contract |
| 18 | Explicit canvas memory cleanup | Scalability | Low | Free GPU memory promptly |
| 19 | Consider IndexedDB for session storage | Scalability | Medium | Higher storage quota |
| 20 | Add skeleton loading states | Usability | Medium | Smoother perceived loading |
| 21 | Re-enable frame deduplication | Performance | Low | Fewer redundant OCR calls |
| 22 | Split React vendor chunk | Performance | Low | Better cache hit rate |
| 23 | Keyboard activation for CategoryCard | Accessibility | Low | WCAG 2.1.1 (A) |
| 24 | Color contrast audit for `/60` opacity text | Accessibility | Medium | WCAG 1.4.3 (AA) |

---

*Assessment generated from source code analysis, build output inspection, and npm audit. No runtime profiling or automated accessibility scanning was performed — recommendations are based on static analysis and architectural review.*
