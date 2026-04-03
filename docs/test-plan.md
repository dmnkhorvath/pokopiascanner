# Pokopia Scanner — Risk-Based Test Plan

> **Generated**: 2026-04-03  
> **Project**: Pokopia Progress Scanner (Vite + React 18 + Tesseract.js v5)  
> **Current Coverage**: 17 tests in 2 files (`fuzzyMatch.test.js`, `scanStorage.test.js`)  
> **Edge Cases Documented**: 30 (in `docs/edge-case-findings.json`)  

---

## Table of Contents

1. [Risk Assessment Matrix](#1-risk-assessment-matrix)
2. [Test Priority Ranking](#2-test-priority-ranking)
3. [Test Scenarios — P0 (Must Have)](#3-test-scenarios--p0-must-have)
4. [Test Scenarios — P1 (Should Have)](#4-test-scenarios--p1-should-have)
5. [Coverage Gap Analysis](#5-coverage-gap-analysis)
6. [Test Infrastructure Recommendations](#6-test-infrastructure-recommendations)

---

## 1. Risk Assessment Matrix

| Module | LOC | Probability (1-5) | Impact (1-5) | Risk Score | Current Tests | Coverage Status |
|---|---|---|---|---|---|---|
| **ocrEngine.js** | 1396 | 5 | 5 | **25** | 0 | ❌ None — entire OCR pipeline untested |
| **gridEngine.js** | 1070 | 5 | 5 | **25** | 0 | ❌ None — all 4 scan modes untested |
| **videoDetector.js** | 317 | 4 | 3 | **12** | 0 | ❌ None — classification heuristics untested |
| **fuzzyMatch.js** | 153 | 2 | 3 | **6** | 6 | ✅ Good — core functions covered |
| **scanStorage.js** | 167 | 2 | 2 | **4** | 7 | ✅ Good — CRUD + quota covered |
| **VideoScanner.jsx** | ~400 | 3 | 4 | **12** | 0 | ❌ None — scan lifecycle untested |
| **App.jsx** | ~300 | 2 | 3 | **6** | 0 | ⚠️ None — but lower risk (routing/state) |
| **LandingPage.jsx** | ~350 | 2 | 2 | **4** | 0 | ⚠️ None — UI-focused, lower risk |
| **ScanResults.jsx** | ~400 | 2 | 2 | **4** | 0 | ⚠️ None — UI-focused, lower risk |

### Risk Score Rationale

#### ocrEngine.js — Risk Score: 25 (CRITICAL)
- **Probability 5/5**: 1396 LOC with complex async pipelines, canvas pixel manipulation, Tesseract.js worker pool management, multiple preprocessing modes, frame deduplication, and 10+ documented unguarded edge cases.
- **Impact 5/5**: Core scanning engine — any failure means zero scan results. Worker leaks cause memory exhaustion. Infinite loops from bad FPS/duration hang the browser tab.
- **Key risks**: Worker pool creation/termination leaks (edge cases at lines 661, 676), division by zero from bad FPS (line 130), null `_matcher` crashes (lines 501, 622), zero-size canvas errors (line 281), infinite frame allocation from `frameIntervalSec=0` (line 1006), invalid video duration propagation (line 911).

#### gridEngine.js — Risk Score: 25 (CRITICAL)
- **Probability 5/5**: 1070 LOC with pixel-level operations, cross-correlation math, fingerprint matching via Float32Array dot products, 4 distinct scan mode pipelines, scroll tracking with cumulative offsets, and 6+ documented edge cases.
- **Impact 5/5**: Powers all 4 scan modes (item, recipe, pokemon, habitat). NaN propagation from empty profiles silently corrupts all downstream correlations. OOB pixel reads produce garbage fingerprints. Zero-dimension grids cause infinite loops.
- **Key risks**: `normalizeProfile` division by zero on empty profile (line 342), OOB pixel reads in `extractVerticalProfile` (line 320), negative `stripX` (line 320), OOB in `extractTileFingerprint` (line 396), `frameIntervalMs=0` infinite loop (line 590), NaN from malformed dataset numbers (line 44), zero video dimensions (line 82).

#### videoDetector.js — Risk Score: 12 (HIGH)
- **Probability 4/5**: Frame extraction relies on browser video APIs with timeouts; classification uses pixel sampling with hardcoded thresholds that may not generalize.
- **Impact 3/5**: Misclassification routes video to wrong scan mode → partial/wrong results, but fallback to 'all' mode exists.
- **Key risks**: Frame extraction timeout on slow devices, `count=0` in `sampleRegion` → division by zero, classification boundary cases near saturation threshold (6%), video with no valid duration.

#### VideoScanner.jsx — Risk Score: 12 (HIGH)
- **Probability 3/5**: Complex async state management with concurrent video processing, abort controllers, and result merging.
- **Impact 4/5**: Scan lifecycle bugs lose results, leak resources, or leave UI in broken state.
- **Key risks**: Abort controller cleanup on unmount, concurrent scan limit enforcement, result merging across multiple videos, error state recovery.

---

## 2. Test Priority Ranking

### P0 — Must Have (Risk Score ≥ 15)

These tests **must exist before any release**. They cover the critical data processing paths where bugs cause data loss, crashes, or resource leaks.

| # | Test Scenario | Module | Risk Score | Edge Case Ref |
|---|---|---|---|---|
| P0-01 | `matchText` — exact match against lookup | ocrEngine.js | 25 | — |
| P0-02 | `matchText` — fuzzy match fallback | ocrEngine.js | 25 | — |
| P0-03 | `matchText` — line splitting by separators | ocrEngine.js | 25 | — |
| P0-04 | `matchText` — deduplication via `seen` set | ocrEngine.js | 25 | — |
| P0-05 | `matchText` — null/uninitialized `_matcher` guard | ocrEngine.js | 25 | ECF: line 622 |
| P0-06 | `matchText` — empty string / whitespace-only input | ocrEngine.js | 25 | — |
| P0-07 | `mergeResults` — combines two result sets without duplicates | ocrEngine.js | 25 | — |
| P0-08 | `mergeResults` — status upgrade (true overrides false/null) | ocrEngine.js | 25 | — |
| P0-09 | `mergeResults` — handles null/undefined inputs gracefully | ocrEngine.js | 25 | — |
| P0-10 | `isUndiscovered` — detects all known text variations | ocrEngine.js | 25 | — |
| P0-11 | `isUndiscovered` — returns false for unrelated text | ocrEngine.js | 25 | — |
| P0-12 | `getDeduplicationCrop` — returns valid crop for each mode | ocrEngine.js | 25 | — |
| P0-13 | `getCategoryTotals` — returns correct default totals | ocrEngine.js | 25 | — |
| P0-14 | `detectGridParams` — correct scaling for 1920×1080 | gridEngine.js | 25 | — |
| P0-15 | `detectGridParams` — zero dimensions throws/guards | gridEngine.js | 25 | ECF: line 82 |
| P0-16 | `normalizeProfile` — empty profile (n=0) guard | gridEngine.js | 25 | ECF: line 342 |
| P0-17 | `normalizeProfile` — constant profile (std=0) | gridEngine.js | 25 | — |
| P0-18 | `normalizeProfile` — normal case produces mean=0, std=1 | gridEngine.js | 25 | — |
| P0-19 | `extractVerticalProfile` — OOB yEnd clamping | gridEngine.js | 25 | ECF: line 320 |
| P0-20 | `extractVerticalProfile` — negative stripX guard | gridEngine.js | 25 | ECF: line 320 |
| P0-21 | `extractTileFingerprint` — OOB tile coordinates | gridEngine.js | 25 | ECF: line 396 |
| P0-22 | `matchFingerprint` — returns best match above threshold | gridEngine.js | 25 | — |
| P0-23 | `matchFingerprint` — returns null below MIN_MATCH_SCORE | gridEngine.js | 25 | — |
| P0-24 | `measurePixelShift` — correct shift detection | gridEngine.js | 25 | — |
| P0-25 | `measurePixelShift` — identical profiles → shift=0 | gridEngine.js | 25 | — |
| P0-26 | `classifyFrame` (gridEngine) — item/recipe row pattern | gridEngine.js | 25 | — |
| P0-27 | `classifyPokemonTile` — captured/sensed/unknown | gridEngine.js | 25 | — |
| P0-28 | `classifyHabitatTile` — built/unbuilt/empty | gridEngine.js | 25 | — |
| P0-29 | `rowsMatch` — tolerance comparison | gridEngine.js | 25 | — |
| P0-30 | Dataset sort — NaN from malformed number field | gridEngine.js | 25 | ECF: line 44 |
| P0-31 | `frameIntervalMs=0` — infinite loop prevention | gridEngine.js | 25 | ECF: line 590 |

### P1 — Should Have (Risk Score 10-14)

Important for confidence. Cover classification heuristics, component lifecycle, and integration paths.

| # | Test Scenario | Module | Risk Score | Edge Case Ref |
|---|---|---|---|---|
| P1-01 | `classifyFrame` (videoDetector) — teal header → item | videoDetector.js | 12 | — |
| P1-02 | `classifyFrame` (videoDetector) — pink header + low sat → pokemon | videoDetector.js | 12 | — |
| P1-03 | `classifyFrame` (videoDetector) — pink header + high sat → habitat | videoDetector.js | 12 | — |
| P1-04 | `classifyFrame` (videoDetector) — unrecognized frame → null | videoDetector.js | 12 | — |
| P1-05 | `contentSaturationPct` — boundary at 6% threshold | videoDetector.js | 12 | — |
| P1-06 | `sampleRegion` — count=0 (empty region) guard | videoDetector.js | 12 | — |
| P1-07 | `detectVideoType` — voting produces correct winner | videoDetector.js | 12 | — |
| P1-08 | `detectVideoType` — all frames fail → fallback 'all' | videoDetector.js | 12 | — |
| P1-09 | `detectVideoType` — timeout fallback | videoDetector.js | 12 | — |
| P1-10 | `withTimeout` — resolves before timeout | videoDetector.js | 12 | — |
| P1-11 | `withTimeout` — rejects on timeout | videoDetector.js | 12 | — |
| P1-12 | VideoScanner — processes single video end-to-end | VideoScanner.jsx | 12 | — |
| P1-13 | VideoScanner — abort cancels in-progress scan | VideoScanner.jsx | 12 | — |
| P1-14 | VideoScanner — concurrent limit (MAX_CONCURRENT=3) | VideoScanner.jsx | 12 | — |
| P1-15 | VideoScanner — error state recovery per video | VideoScanner.jsx | 12 | — |
| P1-16 | VideoScanner — detection fallback on auto-detect failure | VideoScanner.jsx | 12 | — |
| P1-17 | Canvas `getContext('2d')` null guard — ocrEngine | ocrEngine.js | 25→P1* | ECF: line 275 |
| P1-18 | Zero crop region (w=0 or h=0) guard | ocrEngine.js | 25→P1* | ECF: line 281 |
| P1-19 | Worker pool — partial creation failure cleanup | ocrEngine.js | 25→P1* | ECF: line 661 |
| P1-20 | Worker pool — partial termination failure | ocrEngine.js | 25→P1* | ECF: line 676 |
| P1-21 | FPS detection — medianInterval near 0 → Infinity guard | ocrEngine.js | 25→P1* | ECF: line 130 |
| P1-22 | Video duration — NaN/Infinity/0 guard | ocrEngine.js | 25→P1* | ECF: line 911 |
| P1-23 | `frameIntervalSec=0` — OOM prevention | ocrEngine.js | 25→P1* | ECF: line 1006 |
| P1-24 | Preview canvas null context guard | ocrEngine.js | 25→P1* | ECF: line 1035 |

> *P1-17 through P1-24 have module risk score 25 but are classified P1 because they require browser/canvas mocking infrastructure that is complex to set up. They guard against environmental edge cases rather than logic errors.

### P2 — Nice to Have (Risk Score < 10)

| # | Test Scenario | Module | Risk Score |
|---|---|---|---|
| P2-01 | `levenshtein` — Unicode/emoji handling | fuzzyMatch.js | 6 |
| P2-02 | `buildFuzzyMatcher` — empty lookup dictionary | fuzzyMatch.js | 6 |
| P2-03 | `buildFuzzyMatcher` — single-character keys | fuzzyMatch.js | 6 |
| P2-04 | `fuzzyMatch` — very long strings (>100 chars) | fuzzyMatch.js | 6 |
| P2-05 | `saveSession` — MAX_SESSIONS eviction | scanStorage.js | 4 |
| P2-06 | `saveSession` — corrupted localStorage JSON | scanStorage.js | 4 |
| P2-07 | `clearAllSessions` — cleans all keys | scanStorage.js | 4 |
| P2-08 | `estimateStorageUsage` — accuracy check | scanStorage.js | 4 |
| P2-09 | App.jsx — hash routing sync | App.jsx | 6 |
| P2-10 | App.jsx — session restore on mount | App.jsx | 6 |
| P2-11 | App.jsx — auto-save on results change | App.jsx | 6 |
| P2-12 | LandingPage — file deduplication | LandingPage.jsx | 4 |
| P2-13 | LandingPage — non-video file rejection | LandingPage.jsx | 4 |
| P2-14 | ScanResults — search filtering | ScanResults.jsx | 4 |
| P2-15 | ScanResults — export JSON structure | ScanResults.jsx | 4 |
| P2-16 | ScanResults — import & merge | ScanResults.jsx | 4 |
| P2-17 | ErrorBoundary — catches and renders fallback | ErrorBoundary.jsx | 4 |

---

## 3. Test Scenarios — P0 (Must Have)

### P0-01: `matchText` — exact match against lookup
- **Module**: `ocrEngine.js` → `matchText()`
- **Setup**: Initialize `_matcher` with a mock `ocrLookup` containing known entries
- **Input**: `"Pikachu\nBulbasaur\nTall Grass"`
- **Expected**: Returns array of 3 matched items with correct `name`, `type`, `category`
- **Edge cases**: Case variations (`"PIKACHU"`, `"pikachu"`), leading/trailing whitespace

### P0-02: `matchText` — fuzzy match fallback
- **Module**: `ocrEngine.js` → `matchText()`
- **Setup**: Same mock lookup
- **Input**: `"Pikachv"` (1 char off), `"Bulbasaor"` (1 char off)
- **Expected**: Returns fuzzy matches within tolerance=2
- **Edge cases**: Distance exactly at tolerance boundary, distance at tolerance+1 (should not match)

### P0-03: `matchText` — line splitting by separators
- **Module**: `ocrEngine.js` → `matchText()`
- **Input**: `"Pikachu, Bulbasaur | Potion"`
- **Expected**: All 3 items matched after splitting by `,`, `|`
- **Edge cases**: Semicolons, slashes, mixed separators, empty parts after split

### P0-04: `matchText` — deduplication via `seen` set
- **Module**: `ocrEngine.js` → `matchText()`
- **Input**: `"Pikachu\nPikachu\nPIKACHU"`
- **Expected**: Returns exactly 1 match (not 3)
- **Edge cases**: Same item appearing as full line match and as split-part match

### P0-05: `matchText` — null/uninitialized `_matcher` guard
- **Module**: `ocrEngine.js` → `matchText()`
- **Setup**: Call `matchText` before `ensureOcrData()` completes
- **Input**: Any text
- **Expected**: Throws descriptive error OR returns empty array (not TypeError)
- **Ref**: ECF line 622 — `_matcher is null → TypeError: Cannot read property findMatch of null`

### P0-06: `matchText` — empty/whitespace input
- **Module**: `ocrEngine.js` → `matchText()`
- **Input**: `""`, `"   "`, `"\n\n\n"`, `"a"` (single char, filtered by `l.length > 1`)
- **Expected**: Returns empty array `[]`
- **Edge cases**: Null input, undefined input

### P0-07: `mergeResults` — combines two result sets without duplicates
- **Module**: `ocrEngine.js` → `mergeResults()`
- **Setup**: Two result objects with overlapping items
- **Input**: `resultA` has Pikachu + Bulbasaur; `resultB` has Bulbasaur + Charmander
- **Expected**: Merged result has all 3, no duplicate Bulbasaur, `totalFound` = 3
- **Edge cases**: Empty result sets, single-category results

### P0-08: `mergeResults` — status upgrade (true overrides false/null)
- **Module**: `ocrEngine.js` → `mergeResults()`
- **Setup**: `resultA` has Pikachu with `captured: false`; `resultB` has Pikachu with `captured: true`
- **Expected**: Merged Pikachu has `captured: true`
- **Edge cases**: `null` → `true`, `false` → `true`, `true` → `true` (no downgrade)

### P0-09: `mergeResults` — handles null/undefined inputs
- **Module**: `ocrEngine.js` → `mergeResults()`
- **Input**: `mergeResults(null, validResult)`, `mergeResults(validResult, null)`, `mergeResults(null, null)`
- **Expected**: Returns the non-null result or empty structure, never throws

### P0-10: `isUndiscovered` — detects all known text variations
- **Module**: `ocrEngine.js` → `isUndiscovered()`
- **Input**: Each of the 5 known variations:
  - `"haven't discovered this habitat"`
  - `"havent discovered this habitat"`
  - `"haven\u2019t discovered this habitat"` (smart quote)
  - `"not discovered this habitat"`
  - `"haven\'t discovered this habitat"`
- **Expected**: All return `true`

### P0-11: `isUndiscovered` — returns false for unrelated text
- **Module**: `ocrEngine.js` → `isUndiscovered()`
- **Input**: `"Tall Grass"`, `"No. 042"`, `"discovered"`, `""`
- **Expected**: All return `false`

### P0-12: `getDeduplicationCrop` — returns valid crop for each mode
- **Module**: `ocrEngine.js` → `getDeduplicationCrop()`
- **Input**: `'habitat'`, `'pokemon'`, `'item'`, `'all'`, `undefined`
- **Expected**: Each returns `{x, y, w, h}` with all values ≥ 0 and w,h > 0

### P0-13: `getCategoryTotals` — returns correct default totals
- **Module**: `ocrEngine.js` → `getCategoryTotals()`
- **Expected**: `{ pokemon: 300, items: 1254, habitats: 209, recipes: 743 }`

### P0-14: `detectGridParams` — correct scaling for 1920×1080
- **Module**: `gridEngine.js` → `detectGridParams()`
- **Input**: `(1920, 1080)`
- **Expected**: Returns object with `cols=12`, `visibleRows` > 0, `cell` > 0, `col0X` > 0, `row0Y` > 0, `tileHalf` > 0, `width=1920`, `height=1080`, `sx` ≈ 1.0, `sy` ≈ 1.0
- **Edge cases**: Non-standard resolutions (1280×720, 2560×1440)

### P0-15: `detectGridParams` — zero dimensions
- **Module**: `gridEngine.js` → `detectGridParams()`
- **Input**: `(0, 1080)`, `(1920, 0)`, `(0, 0)`
- **Expected**: Throws error OR returns safe defaults (not zero-valued params that cause downstream division by zero)
- **Ref**: ECF line 82 — `videoWidth or videoHeight is 0 → all scaled params become 0`

### P0-16: `normalizeProfile` — empty profile (n=0)
- **Module**: `gridEngine.js` → `normalizeProfile()`
- **Input**: `new Float64Array(0)`
- **Expected**: Returns empty Float64Array without NaN or division by zero
- **Ref**: ECF line 342 — `mean /= 0 → NaN; all downstream correlations become NaN`

### P0-17: `normalizeProfile` — constant profile (std=0)
- **Module**: `gridEngine.js` → `normalizeProfile()`
- **Input**: `Float64Array.from([128, 128, 128, 128])`
- **Expected**: Returns zero-filled array (std < 0.001 guard), no NaN

### P0-18: `normalizeProfile` — normal case
- **Module**: `gridEngine.js` → `normalizeProfile()`
- **Input**: `Float64Array.from([10, 20, 30, 40])`
- **Expected**: Output has mean ≈ 0 and std ≈ 1 (within floating point tolerance)

### P0-19: `extractVerticalProfile` — OOB yEnd clamping
- **Module**: `gridEngine.js` → `extractVerticalProfile()`
- **Setup**: Mock `ImageData` with known dimensions (e.g., 100×50)
- **Input**: `yEnd = 100` (exceeds height of 50)
- **Expected**: Does not read beyond array bounds; returns valid profile for clamped range
- **Ref**: ECF line 320 — `yEnd exceeds imageData height → OOB pixel read`

### P0-20: `extractVerticalProfile` — negative stripX
- **Module**: `gridEngine.js` → `extractVerticalProfile()`
- **Input**: `stripX = -10`, `stripW = 20`
- **Expected**: Clamps to 0 or throws; does not produce NaN from negative array indices
- **Ref**: ECF line 320 — `stripX is negative → pixel index underflows`

### P0-21: `extractTileFingerprint` — OOB tile coordinates
- **Module**: `gridEngine.js` → `extractTileFingerprint()`
- **Setup**: Mock `ImageData` 100×100
- **Input**: `tx=90, ty=90, tw=20, th=20` (extends beyond bounds)
- **Expected**: Clamps or throws; does not read undefined bytes
- **Ref**: ECF line 396 — `tx+tw or ty+th exceeds imageData dimensions`

### P0-22: `matchFingerprint` — returns best match above threshold
- **Module**: `gridEngine.js` → `matchFingerprint()`
- **Setup**: Pre-loaded `fpVectors` with known fingerprints
- **Input**: Tile fingerprint that closely matches a known icon
- **Expected**: Returns `{ name, score }` with `score >= MIN_MATCH_SCORE (0.65)`

### P0-23: `matchFingerprint` — returns null below threshold
- **Module**: `gridEngine.js` → `matchFingerprint()`
- **Input**: Random noise fingerprint
- **Expected**: Returns `null` (no match above 0.65)

### P0-24: `measurePixelShift` — correct shift detection
- **Module**: `gridEngine.js` → `measurePixelShift()`
- **Setup**: Two profiles where the second is shifted by N pixels
- **Input**: `prevProfile` = sine wave, `currProfile` = same wave shifted by 5px
- **Expected**: `{ shift: 5, correlation: > 0.9 }`

### P0-25: `measurePixelShift` — identical profiles
- **Module**: `gridEngine.js` → `measurePixelShift()`
- **Input**: Two identical normalized profiles
- **Expected**: `{ shift: 0, correlation: ~1.0 }`

### P0-26: `classifyFrame` (gridEngine) — item/recipe row pattern
- **Module**: `gridEngine.js` → `classifyFrame()`
- **Setup**: Mock `ImageData` with known grid pattern and grid params
- **Input**: Frame with D/U pattern matching item grid
- **Expected**: Returns classification array matching expected row pattern

### P0-27: `classifyPokemonTile` — captured/sensed/unknown
- **Module**: `gridEngine.js` → `classifyPokemonTile()`
- **Setup**: Mock `ImageData` pixels
- **Input cases**:
  - High saturation (>20) → `'C'` (captured)
  - Low saturation, low brightness (≤180) → `'S'` (sensed/silhouette)
  - Low saturation, high brightness (>180) → `'U'` (unknown/?)
- **Expected**: Correct classification character for each

### P0-28: `classifyHabitatTile` — built/unbuilt/empty
- **Module**: `gridEngine.js` → `classifyHabitatTile()`
- **Setup**: Mock `ImageData` pixels
- **Input cases**:
  - Colorful scenic pixels → built
  - Purple blob (H 230-330) → unbuilt
  - Transition/empty → empty
- **Expected**: Correct classification for each

### P0-29: `rowsMatch` — tolerance comparison
- **Module**: `gridEngine.js` → `rowsMatch()`
- **Input**: Two row arrays `[D,D,U,U]` vs `[D,D,U,U]` (identical), tolerance=1
- **Expected**: `true`
- **Input**: `[D,D,U,U]` vs `[U,U,D,D]` (completely different)
- **Expected**: `false`
- **Edge cases**: Arrays of different lengths, empty arrays

### P0-30: Dataset sort — NaN from malformed number field
- **Module**: `gridEngine.js` → `ensureGridData()` sort comparators
- **Setup**: Dataset with entries having `number: null`, `number: ""`, `number: "abc"`
- **Input**: Sort comparator receives malformed entries
- **Expected**: Sort completes without error; malformed entries sort to consistent position
- **Ref**: ECF line 44 — `parseInt returns NaN → unstable sort order`

### P0-31: `frameIntervalMs=0` — infinite loop prevention
- **Module**: `gridEngine.js` → scan functions
- **Setup**: Settings with `frameIntervalMs: 0`
- **Input**: Any video
- **Expected**: Clamps to minimum value (e.g., 1ms) or throws; does not enter infinite loop
- **Ref**: ECF line 590 — `frameIntervalMs=0 → frameIntervalSec=0 → infinite loop`

---

## 4. Test Scenarios — P1 (Should Have)

### P1-01: `classifyFrame` (videoDetector) — teal header → item
- **Module**: `videoDetector.js` → `classifyFrame()`
- **Setup**: Synthetic `ImageData` with teal header region (G > 200, G > R × 1.2) and light edges (lum > 220)
- **Expected**: Returns `{ type: 'item', details: { ... } }`

### P1-02: `classifyFrame` (videoDetector) — pink header + low sat → pokemon
- **Setup**: Synthetic `ImageData` with pink header (R > 200, R > G, sat > 50), dark edges (lum < 180), content saturation < 6%
- **Expected**: Returns `{ type: 'pokemon' }`

### P1-03: `classifyFrame` (videoDetector) — pink header + high sat → habitat
- **Setup**: Same pink header but content saturation ≥ 6%
- **Expected**: Returns `{ type: 'habitat' }`

### P1-04: `classifyFrame` (videoDetector) — unrecognized → null
- **Setup**: Synthetic `ImageData` with no matching header pattern
- **Expected**: Returns `{ type: null }`

### P1-05: `contentSaturationPct` — boundary at 6% threshold
- **Module**: `videoDetector.js` → `contentSaturationPct()`
- **Input**: Synthetic image with exactly 5.9% high-saturation pixels
- **Expected**: Returns value < 6 → classified as pokemon
- **Input**: Synthetic image with exactly 6.1% high-saturation pixels
- **Expected**: Returns value ≥ 6 → classified as habitat

### P1-06: `sampleRegion` — count=0 (empty region)
- **Module**: `videoDetector.js` → `sampleRegion()`
- **Input**: Region with zero width or height
- **Expected**: Returns `{ r: 0, g: 0, b: 0 }` without division by zero

### P1-07: `detectVideoType` — voting produces correct winner
- **Module**: `videoDetector.js` → `detectVideoType()`
- **Setup**: Mock `extractFrame` to return frames that classify as 5× item, 2× pokemon, 1× habitat
- **Expected**: Returns `{ detectedMode: 'item', confidence: 'high' }`

### P1-08: `detectVideoType` — all frames fail → fallback
- **Setup**: Mock `extractFrame` to always throw
- **Expected**: Returns `{ detectedMode: 'all', confidence: 'low', detectedAt: null }`

### P1-09: `detectVideoType` — timeout fallback
- **Setup**: Mock `extractFrame` to hang indefinitely
- **Expected**: Returns fallback after `TOTAL_TIMEOUT_MS` (20s)

### P1-10: `withTimeout` — resolves before timeout
- **Input**: Promise that resolves in 10ms, timeout 1000ms
- **Expected**: Resolves with value, timer cleared

### P1-11: `withTimeout` — rejects on timeout
- **Input**: Promise that never resolves, timeout 50ms
- **Expected**: Rejects with timeout error message

### P1-12 through P1-16: VideoScanner Component Tests
- These require React Testing Library + mocked `scanVideo`/`detectVideoType`
- **P1-12**: Renders, calls `scanVideo`, transitions through queued→detecting→scanning→complete
- **P1-13**: Abort controller cancels scan, status becomes 'error' with 'Cancelled'
- **P1-14**: With 5 videos, only 3 process concurrently
- **P1-15**: One video error doesn't block others; error state shown per-video
- **P1-16**: Auto-detect failure falls back to 'all' mode silently

### P1-17 through P1-24: Canvas/Browser Environment Edge Cases
- These require canvas mocking (e.g., `jest-canvas-mock` or `vitest` canvas polyfill)
- **P1-17**: `canvas.getContext('2d')` returns null → graceful error, not TypeError
- **P1-18**: Crop region with `w=0` or `h=0` → error or safe minimum, not `InvalidStateError`
- **P1-19**: Worker pool creation where 2nd worker fails → 1st worker terminated, no leak
- **P1-20**: Worker termination where 1st `terminate()` throws → remaining workers still terminated via `Promise.allSettled`
- **P1-21**: `medianInterval ≈ 0` → FPS clamped to max 240, not Infinity
- **P1-22**: `video.duration` is NaN/Infinity/0 → throws descriptive error
- **P1-23**: `frameIntervalSec = 0` → `framesToProcess` clamped, not Infinity
- **P1-24**: Preview canvas context null → skip preview, don't crash scan loop

---

## 5. Coverage Gap Analysis

### What the Current 17 Tests Cover

#### fuzzyMatch.test.js (6 tests)
| Test | Function | What's Covered |
|---|---|---|
| `levenshtein` identical strings | `levenshtein()` | Zero distance |
| `levenshtein` single edit | `levenshtein()` | Substitution distance |
| `levenshtein` empty strings | `levenshtein()` | Boundary: empty input |
| `exactMatch` case-insensitive | `buildFuzzyMatcher().exactMatch()` | Case normalization |
| `fuzzyMatch` within tolerance | `buildFuzzyMatcher().fuzzyMatch()` | Prefix index + distance calc |
| `findMatch` prefers exact | `buildFuzzyMatcher().findMatch()` | Exact → fuzzy fallback chain |

**Gaps in fuzzyMatch**: No tests for empty lookup dict, single-char inputs, very long strings, Unicode, maxDistance=0, full-scan fallback for short texts (≤15 chars), prefix index miss scenarios.

#### scanStorage.test.js (7 tests + 4 implicit)
| Test | Function | What's Covered |
|---|---|---|
| Save new session | `saveSession()` | Create + return ID |
| Update existing session | `saveSession()` | Update by ID |
| Load saved session | `loadSession()` | Retrieve by ID |
| Load non-existent | `loadSession()` | Null return |
| Delete session | `deleteSession()` | Remove + verify |
| List empty | `listSessions()` | Empty state |
| List sorted | `listSessions()` | Date ordering |
| Storage usage | `estimateStorageUsage()` | Positive number |

**Gaps in scanStorage**: No tests for `QUOTA_EXCEEDED` return, `MAX_SESSIONS` eviction, `clearAllSessions()`, `loadLatestSession()`, corrupted JSON in localStorage, `MAX_PAYLOAD_BYTES` limit enforcement.

### Critical Untested Paths

| Priority | Module | Untested Path | Impact |
|---|---|---|---|
| 🔴 CRITICAL | ocrEngine.js | Entire `scanVideo()` pipeline | Core feature completely untested |
| 🔴 CRITICAL | ocrEngine.js | `matchText()` — text→item matching | Core matching logic untested |
| 🔴 CRITICAL | ocrEngine.js | `mergeResults()` — result combination | Data integrity untested |
| 🔴 CRITICAL | ocrEngine.js | Worker pool lifecycle | Resource leak risk |
| 🔴 CRITICAL | ocrEngine.js | Frame preprocessing (green channel, B&W) | OCR accuracy untested |
| 🔴 CRITICAL | gridEngine.js | All 4 scan mode pipelines | Core feature completely untested |
| 🔴 CRITICAL | gridEngine.js | `normalizeProfile()` / `measurePixelShift()` | Math correctness untested |
| 🔴 CRITICAL | gridEngine.js | `matchFingerprint()` — icon recognition | Core matching untested |
| 🔴 CRITICAL | gridEngine.js | Scroll tracking (cross-correlation) | Position accuracy untested |
| 🟡 HIGH | videoDetector.js | `classifyFrame()` — type detection | Misclassification risk |
| 🟡 HIGH | videoDetector.js | `detectVideoType()` — voting logic | Wrong mode selection |
| 🟡 HIGH | VideoScanner.jsx | Scan lifecycle & concurrency | UI state corruption risk |
| 🟢 MEDIUM | App.jsx | Session restore, auto-save, routing | UX bugs |
| 🟢 MEDIUM | LandingPage.jsx | File handling, settings | Input validation |
| 🟢 MEDIUM | ScanResults.jsx | Filtering, export, import | Data presentation |

### Coverage by Lines of Code

| Status | LOC | % of Total |
|---|---|---|
| ✅ Tested | 320 (fuzzyMatch + scanStorage) | **8.2%** |
| ❌ Untested (critical) | 2,783 (ocrEngine + gridEngine + videoDetector) | **71.3%** |
| ⚠️ Untested (UI) | ~800 (components) | **20.5%** |
| **Total** | **~3,903** | |

---

## 6. Test Infrastructure Recommendations

### Testing Framework
- **Vitest** (already configured) — fast, Vite-native, ESM-compatible
- **@testing-library/react** — for component tests (P1-12 through P1-16)
- **jsdom** environment — for DOM/canvas mocking

### Mocking Strategy

| Dependency | Mock Approach |
|---|---|
| `tesseract.js` | Mock `createWorker` → return stub with `recognize()`, `terminate()` |
| Canvas 2D Context | Use `jest-canvas-mock` or manual mock returning `ImageData` |
| `HTMLVideoElement` | Mock `loadedmetadata`, `seeked` events, `duration`, `currentTime` |
| `localStorage` | Already mocked in `scanStorage.test.js` — reuse pattern |
| `crypto.randomUUID` | Already mocked — reuse pattern |
| JSON assets | Import directly (small enough) or mock for isolation |
| `AbortController` | Use real `AbortController` (available in Node 16+) |

### Recommended Test File Structure

```
src/utils/__tests__/
├── fuzzyMatch.test.js          ✅ exists (6 tests)
├── scanStorage.test.js         ✅ exists (7 tests)
├── ocrEngine.matchText.test.js       NEW — P0-01 through P0-06
├── ocrEngine.mergeResults.test.js    NEW — P0-07 through P0-09
├── ocrEngine.helpers.test.js         NEW — P0-10 through P0-13
├── ocrEngine.pipeline.test.js        NEW — P1-17 through P1-24
├── gridEngine.math.test.js           NEW — P0-16 through P0-25
├── gridEngine.classify.test.js       NEW — P0-26 through P0-29
├── gridEngine.data.test.js           NEW — P0-14, P0-15, P0-30, P0-31
├── videoDetector.test.js             NEW — P1-01 through P1-11
src/components/__tests__/
├── VideoScanner.test.jsx             NEW — P1-12 through P1-16
```

### Execution Priority Order

1. **Phase 1** (Immediate): P0-01 → P0-13 (ocrEngine pure functions) — no mocking needed
2. **Phase 2** (Next): P0-14 → P0-31 (gridEngine math + classification) — needs ImageData mocks
3. **Phase 3** (Then): P1-01 → P1-11 (videoDetector) — needs ImageData + video mocks
4. **Phase 4** (After): P1-12 → P1-16 (VideoScanner component) — needs React Testing Library
5. **Phase 5** (Finally): P1-17 → P1-24 (browser environment edge cases) — needs canvas/worker mocks
6. **Phase 6** (Bonus): P2-01 → P2-17 (completeness) — incremental additions

### Estimated Effort

| Phase | Tests | Estimated Hours | Dependencies |
|---|---|---|---|
| Phase 1 | 13 tests | 3-4h | None (pure functions) |
| Phase 2 | 18 tests | 5-6h | ImageData mock helper |
| Phase 3 | 11 tests | 3-4h | ImageData + video mocks |
| Phase 4 | 5 tests | 4-5h | React Testing Library setup |
| Phase 5 | 8 tests | 4-5h | Canvas/Worker mock infrastructure |
| Phase 6 | 17 tests | 3-4h | Incremental |
| **Total** | **72 tests** | **22-28h** | |

---

## Appendix: Edge Case Findings Cross-Reference

All 30 documented edge cases from `docs/edge-case-findings.json` mapped to test scenarios:

| ECF Location | Trigger | Test Ref | Priority |
|---|---|---|---|
| ocrEngine.js:275 | `getContext('2d')` returns null | P1-17 | P1 |
| ocrEngine.js:281 | cropRegion w/h = 0 | P1-18 | P1 |
| ocrEngine.js:622 | `_matcher` is null | P0-05 | P0 |
| ocrEngine.js:911 | duration NaN/Infinity/0 | P1-22 | P1 |
| ocrEngine.js:1006 | frameIntervalSec = 0 | P1-23 | P1 |
| ocrEngine.js:661 | Worker creation partial failure | P1-19 | P1 |
| ocrEngine.js:676 | Worker termination partial failure | P1-20 | P1 |
| ocrEngine.js:130 | medianInterval ≈ 0 → fps Infinity | P1-21 | P1 |
| ocrEngine.js:501 | `_matcher` null in habitat scan | P0-05 | P0 |
| ocrEngine.js:1035 | preview canvas context null | P1-24 | P1 |
| gridEngine.js:342 | normalizeProfile empty (n=0) | P0-16 | P0 |
| gridEngine.js:320 | yEnd exceeds imageData height | P0-19 | P0 |
| gridEngine.js:320 | stripX negative | P0-20 | P0 |
| gridEngine.js:396 | tile coords exceed dimensions | P0-21 | P0 |
| gridEngine.js:590 | frameIntervalMs = 0 | P0-31 | P0 |
| gridEngine.js:44 | malformed number field → NaN | P0-30 | P0 |
| gridEngine.js:82 | videoWidth/Height = 0 | P0-15 | P0 |

> Remaining 13 edge cases from the findings file cover additional canvas context failures, pixel boundary conditions, and async timing issues that are addressed by the P1 browser environment tests and the general robustness improvements recommended in the guard snippets.
