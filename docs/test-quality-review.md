# Pokopia Scanner — Test Quality Review

**Date**: 2026-04-03  
**Auditor**: Agent Zero Test Quality Auditor  
**Scope**: 6 test files, 146 tests in `src/utils/__tests__/`  
**Framework**: Vitest  
**Result**: All 146 tests passing (825ms execution)

---

## 1. Executive Summary

### Overall Quality Score: **86 / 100**

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| A. Determinism | 25% | 92 | 23.0 |
| B. Isolation | 25% | 85 | 21.3 |
| C. Maintainability | 25% | 82 | 20.5 |
| D. Performance | 15% | 95 | 14.3 |
| E. Coverage Quality | 10% | 72 | 7.2 |
| **Total** | **100%** | | **86.3** |

The test suite is **well-engineered** with strong determinism, excellent performance, and thorough edge-case coverage for the modules it tests. The primary gaps are in coverage breadth (some exported functions untested) and minor isolation concerns with global state in `gridEngine.test.js`.

---

## 2. Per-Dimension Scores with Evidence

### A. Determinism — 92/100

**What's done well:**
- `crypto.randomUUID` is mocked with a deterministic counter (`test-uuid-${++uuidCounter}`) in `scanStorage.test.js` — eliminates randomness from session IDs
- `localStorage` is fully mocked with a plain object store — no real browser storage dependency
- `URL.createObjectURL` / `URL.revokeObjectURL` are mocked in `videoDetector.test.js` — avoids JSDOM limitations
- Tesseract.js is mocked via `vi.mock('tesseract.js')` — no real OCR worker initialization
- All JSON asset imports are mocked with deterministic inline data — no file I/O
- No `Date.now()`, `Math.random()`, or `setTimeout` usage in any test assertions
- No network calls or external service dependencies

**Minor concerns:**
- `scanStorage.js` source uses `new Date().toISOString()` for session dates, but tests don't mock `Date` — session ordering tests rely on execution speed being fast enough that timestamps differ. This works in practice but is theoretically non-deterministic.
- `uuidCounter` is a module-level mutable variable reset in `beforeEach` — correct pattern but fragile if test runner parallelizes within a file (Vitest doesn't by default, so this is safe).

**Deduction rationale:** -8 for unmocked `Date` constructor in scanStorage tests.

---

### B. Isolation — 85/100

**What's done well:**
- `scanStorage.test.js`: Exemplary isolation — `beforeEach` clears localStorage mock, resets all mocks, and resets UUID counter. Every test starts from a clean slate.
- `videoDetector.test.js`: Proper `beforeEach`/`afterEach` pattern — mocks `createObjectURL` before each test, restores originals after each test, calls `vi.restoreAllMocks()`.
- `scanDiff.test.js`: Stateless pure functions — no setup needed, no shared state. Each test constructs its own input data via helper functions (`makeResults`, `pokemon`, `item`, etc.).
- `fuzzyMatch.test.js`: Stateless — `levenshtein` is a pure function, `buildFuzzyMatcher` creates a new matcher per describe block.
- `ocrEngine.test.js`: Uses `beforeAll` to initialize `_matcher` via `getCategoryTotals()` — this is read-only shared state, acceptable for performance.

**Concerns:**

1. **gridEngine.test.js — Global state pollution** (Major)
   ```javascript
   globalThis.REF_WIDTH = 1920;
   globalThis.REF_HEIGHT = 1080;
   globalThis.ITEM_COLS = 12;
   // ... 15+ more globalThis assignments
   ```
   These are set at module level and never cleaned up. If another test file imports `gridEngine.js` or reads these globals, it would see test values. While Vitest isolates files by default, this is an anti-pattern that could cause issues if isolation settings change.

2. **ocrEngine.test.js — Module-level mock state**
   The `mockOcrLookup` and `mockDataset` objects are defined at module level and shared across all tests. If any test mutated these objects, it would affect subsequent tests. Currently no test mutates them, but there's no defensive copying.

3. **scanStorage.test.js — setItem mock restoration**
   In the `QUOTA_EXCEEDED` test for `QuotaExceededError`, the mock implementation is manually restored:
   ```javascript
   localStorageMock.setItem.mockImplementation((key, value) => {
     localStorageMock._store[key] = String(value);
   });
   ```
   This works but is fragile — if the test fails before restoration, subsequent tests break. Should use `afterEach` or Vitest's built-in mock restoration.

**Deduction rationale:** -10 for globalThis pollution in gridEngine, -3 for manual mock restoration in scanStorage, -2 for unprotected shared mock objects.

---

### C. Maintainability — 82/100

**What's done well:**

1. **Descriptive test names with priority labels:**
   ```
   'P0-13: getCategoryTotals returns correct counts from mocked dataset'
   'P1: splits lines by comma separator and matches each part'
   'P1-04: unrecognized input (number) falls back to "all"'
   ```
   Priority prefixes (P0/P1) trace back to the test plan, making it easy to understand test importance.

2. **Logical describe/it nesting:**
   Tests are grouped by function name, then by priority level, then by edge case category. Example:
   ```
   describe('matchText — P0 core')
   describe('matchText — P1 edge cases')
   describe('matchPokemonFrame — P1 edge cases')
   ```

3. **Specific assertions:**
   - Uses `toBe` for primitives, `toEqual` for objects/arrays
   - Uses `toContain` for array membership checks
   - Uses `toThrow('Invalid video dimensions')` with specific error messages
   - Uses `toBeCloseTo` for floating-point comparisons
   - Uses `toHaveProperty` for shape validation

4. **Helper functions in scanDiff.test.js:**
   ```javascript
   function makeResults(pokemonArr, itemsArr, habitatsArr, recipesArr) { ... }
   function pokemon(name) { return { name }; }
   function item(name) { return { name }; }
   ```
   Clean factory functions that reduce boilerplate.

**Concerns:**

1. **Duplicated mock data across files** (Moderate)
   `mockDataset` with identical structure appears in both `ocrEngine.test.js` and `gridEngine.test.js`. A shared test fixtures file would reduce duplication and ensure consistency.

2. **Magic numbers in gridEngine globals:**
   While commented ("Define missing module-level constants as globals"), values like `138`, `247`, `270`, `240` are domain-specific pixel coordinates without explaining what they represent in the game UI.

3. **Some assertions could be more specific:**
   ```javascript
   expect(Array.isArray(list)).toBe(true); // Could use expect(list).toBeInstanceOf(Array)
   expect(typeof usage).toBe('number');    // Could use expect(usage).toBeTypeOf('number')
   ```

4. **Inconsistent P0/P1 labeling:**
   Some tests have priority labels, others don't. The base `scanStorage` tests (save, load, delete, list) lack priority labels while the edge case tests have them.

**Deduction rationale:** -8 for duplicated mock data, -4 for inconsistent labeling, -3 for magic numbers, -3 for assertion style inconsistencies.

---

### D. Performance — 95/100

**Test execution breakdown:**

| File | Tests | Duration |
|---|---|---|
| fuzzyMatch.test.js | 19 | 18ms |
| scanDiff.test.js | 14 | 17ms |
| scanStorage.test.js | 18 | 76ms |
| videoDetector.test.js | 16 | 102ms |
| ocrEngine.test.js | 44 | 183ms |
| gridEngine.test.js | 35 | 429ms |
| **Total** | **146** | **825ms** |

**What's done well:**
- Total test execution is **825ms** — well under the 5s target
- All heavy dependencies (Tesseract.js, JSON assets, browser APIs) are properly mocked
- No real file I/O, network calls, or browser rendering
- Pure function tests (fuzzyMatch, scanDiff) complete in <20ms
- No unnecessary `async` operations in synchronous tests

**Minor concerns:**
- `gridEngine.test.js` at 429ms is the slowest file — likely due to `createMockImageData` generating large pixel arrays (1920×1080×4 = 8.3M entries). Consider smaller test images where full resolution isn't needed.
- Total duration including setup is 5.83s (transform 931ms, import 1.05s, environment 11.93s) — the environment setup dominates. This is Vitest/JSDOM overhead, not a test quality issue.

**Deduction rationale:** -5 for gridEngine's relatively heavy ImageData allocation.

---

### E. Coverage Quality — 72/100

**What's well-covered:**

| Module | Functions Tested | Happy Path | Error Path | Edge Cases |
|---|---|---|---|---|
| fuzzyMatch.js | `levenshtein`, `buildFuzzyMatcher` (exactMatch, fuzzyMatch, findMatch) | ✅ | ✅ | ✅ Unicode, empty, multi-byte, tolerance=0 |
| scanStorage.js | `saveSession`, `loadSession`, `deleteSession`, `listSessions`, `loadLatestSession`, `clearAllSessions`, `estimateStorageUsage` | ✅ | ✅ | ✅ MAX_SESSIONS eviction, QUOTA_EXCEEDED, corrupted JSON |
| scanDiff.js | `computeScanDiff`, `formatDiffSummary`, `buildNewItemSet` | ✅ | ✅ | ✅ null inputs, empty categories, missing keys |
| videoDetector.js | `detectVideoType` | ✅ | ✅ | ✅ null, undefined, number, object, array, boolean, concurrent calls |
| ocrEngine.js | `matchText`, `mergeResults`, `getCategoryTotals`, `matchHabitatFrame`, `matchPokemonFrame`, constants | ✅ | ✅ | ✅ separators, dedup, gibberish, long strings |
| gridEngine.js | `classifyFrame`, `findRowShift`, `getGridDataList`, `detectGridParams` | ✅ | ✅ | ✅ resolutions, zero dims, empty arrays |

**Coverage gaps:**

1. **`scanGridVideo()` — NOT TESTED** (Critical)
   The main grid scanning orchestration function (exported, 80+ lines) has zero test coverage. This is the primary entry point for grid-based scanning.

2. **`scanVideo()` — NOT TESTED** (Critical)
   The main OCR scanning orchestration function (exported, 200+ lines) has zero test coverage. This is the core scanning pipeline.

3. **`detectVideoFPS()` — NOT TESTED** (High)
   FPS detection function with known edge cases (median interval near 0 → Infinity FPS) documented in `edge-case-findings.json` but not tested.

4. **Edge cases from `edge-case-findings.json` partially covered:**
   - ✅ `matchText` before `ensureOcrData` (tested via `beforeAll` init pattern)
   - ✅ `detectGridParams` with zero/null dimensions (tested with `toThrow`)
   - ❌ Canvas `getContext('2d')` returning null (10+ call sites)
   - ❌ `cropRegion` w/h = 0 → zero-size canvas
   - ❌ `video.duration` is NaN/Infinity/0
   - ❌ `frameIntervalSec` = 0 → infinite loop
   - ❌ Worker creation failure in `Promise.all`
   - ❌ Partial worker termination failure
   - ❌ FPS median interval near 0

5. **No behavioral tests for preprocessing functions:**
   `extractFrameToCanvas`, `extractGreenChannel`, `quickFrameCompare` — these image processing functions are untested (though they require canvas/DOM which is hard to test in JSDOM).

**Deduction rationale:** -15 for untested `scanVideo`/`scanGridVideo`, -8 for untested `detectVideoFPS`, -5 for uncovered edge-case-findings.

---

## 3. Per-File Quality Assessment

### fuzzyMatch.test.js — **90/100** ⭐
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Excellent | Pure functions, no external deps |
| Isolation | Excellent | Stateless, no setup needed |
| Maintainability | Very Good | Clean structure, descriptive names |
| Performance | Excellent | 18ms for 19 tests |
| Coverage | Very Good | Core API well covered; missing empty lookup dict test |

### scanStorage.test.js — **91/100** ⭐
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Very Good | Mocked localStorage + crypto; unmocked Date |
| Isolation | Very Good | beforeEach cleanup; one manual mock restore |
| Maintainability | Excellent | Clear naming, logical grouping |
| Performance | Excellent | 76ms for 18 tests |
| Coverage | Excellent | All 7 exports tested including edge cases |

### scanDiff.test.js — **93/100** ⭐⭐
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Excellent | Pure functions, factory helpers |
| Isolation | Excellent | No shared state, clean factories |
| Maintainability | Excellent | Best helper pattern in the suite |
| Performance | Excellent | 17ms for 14 tests |
| Coverage | Excellent | All 3 exports tested with null/empty/missing keys |

### videoDetector.test.js — **89/100** ⭐
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Excellent | Mocked browser APIs, forced fallback path |
| Isolation | Excellent | beforeEach/afterEach with restoreAllMocks |
| Maintainability | Very Good | Good naming; well-documented JSDOM limitation |
| Performance | Good | 102ms for 16 tests |
| Coverage | Good | Fallback path thoroughly tested; happy path (actual video detection) untestable in JSDOM |

### ocrEngine.test.js — **82/100**
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Very Good | All imports mocked; beforeAll init |
| Isolation | Good | Shared mock objects not defensively copied |
| Maintainability | Good | P0/P1 labels; some long test blocks |
| Performance | Good | 183ms for 44 tests |
| Coverage | Fair | 5 of 10 exports tested; scanVideo, detectVideoFPS missing |

### gridEngine.test.js — **78/100**
| Metric | Rating | Notes |
|---|---|---|
| Determinism | Good | Mocked assets; deterministic ImageData |
| Isolation | Fair | 15+ globalThis mutations never cleaned up |
| Maintainability | Good | Helper function for ImageData; magic numbers |
| Performance | Fair | 429ms — heavy ImageData allocation |
| Coverage | Fair | 4 of 5 exports tested; scanGridVideo missing |

---

## 4. Top 10 Specific Findings (Issues to Fix)

### 🔴 Critical

**F1. `scanVideo()` has zero test coverage**
- **File**: `ocrEngine.test.js`
- **Impact**: The 200+ line core scanning pipeline — frame extraction, worker management, progress reporting, abort handling — is completely untested
- **Risk**: Regressions in the primary user-facing feature go undetected
- **Recommendation**: Add integration-level tests with mocked video element and Tesseract workers. Test abort signal handling, progress callback sequence, and result aggregation. Even testing the setup/teardown logic (worker creation/termination) would add significant value.

**F2. `scanGridVideo()` has zero test coverage**
- **File**: `gridEngine.test.js`
- **Impact**: The grid-based scanning orchestration function is untested
- **Risk**: Grid scanning regressions undetected
- **Recommendation**: Mock the video element and test frame classification aggregation, row shift detection across frames, and result compilation.

### 🟠 High

**F3. `detectVideoFPS()` untested despite known edge cases**
- **File**: `ocrEngine.test.js`
- **Impact**: FPS detection with documented edge case (median interval → 0 → Infinity FPS) has no tests
- **Risk**: Edge case `edge-case-findings.json` finding #8 could cause infinite loops
- **Recommendation**: Mock `requestVideoFrameCallback` or the video element to test FPS calculation logic, especially the clamping guard.

**F4. globalThis pollution in gridEngine.test.js**
- **File**: `gridEngine.test.js`, lines 5-20
- **Impact**: 15+ global constants set at module level, never cleaned up
- **Risk**: Cross-file test contamination if Vitest isolation changes
- **Fix**: Move to `beforeAll`/`afterAll` with cleanup, or use `vi.stubGlobal()` which auto-restores:
  ```javascript
  beforeAll(() => {
    vi.stubGlobal('REF_WIDTH', 1920);
    vi.stubGlobal('REF_HEIGHT', 1080);
    // ...
  });
  ```

**F5. `Date` constructor not mocked in scanStorage.test.js**
- **File**: `scanStorage.test.js`
- **Impact**: Session ordering test relies on real clock — `new Date(sessions[0].date) >= new Date(sessions[1].date)` could theoretically fail if both sessions get the same millisecond timestamp
- **Fix**: Use `vi.useFakeTimers()` and `vi.setSystemTime()` to control time:
  ```javascript
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  ```

### 🟡 Medium

**F6. Manual mock restoration in scanStorage QUOTA_EXCEEDED test**
- **File**: `scanStorage.test.js`, QUOTA_EXCEEDED QuotaExceededError test
- **Impact**: If the test fails before the manual `mockImplementation` restore, subsequent tests break
- **Fix**: Wrap in a dedicated `describe` with its own `afterEach`, or use `vi.spyOn` which auto-restores with `vi.restoreAllMocks()`.

**F7. Duplicated mockDataset across ocrEngine and gridEngine tests**
- **Files**: `ocrEngine.test.js`, `gridEngine.test.js`
- **Impact**: Same dataset structure defined twice — changes must be synchronized
- **Fix**: Extract to `__tests__/fixtures/mockDataset.js` and import in both files.

**F8. gridEngine ImageData allocation is unnecessarily large**
- **File**: `gridEngine.test.js`
- **Impact**: Creating 1920×1080 ImageData (8.3M array entries) for tests that only check row classification. Contributes to 429ms execution time.
- **Fix**: Use smaller dimensions (e.g., 192×108) with proportionally scaled grid parameters for most tests. Reserve full-resolution only for the specific scaling test.

### 🟢 Low

**F9. Inconsistent priority labeling across test files**
- **Files**: All test files
- **Impact**: Base tests in scanStorage, fuzzyMatch lack P0 labels while edge case tests have P1 labels. Makes it harder to map tests to the test plan.
- **Fix**: Add P0 labels to all base/happy-path tests for consistency.

**F10. Some assertions use indirect type checks**
- **Files**: Multiple
- **Impact**: `expect(Array.isArray(list)).toBe(true)` is less idiomatic than Vitest's built-in matchers
- **Fix**: Use `expect(list).toBeInstanceOf(Array)` or custom matcher. Similarly, `expect(typeof usage).toBe('number')` → `expect(usage).toBeTypeOf('number')`.

---

## 5. Top 5 Strengths

### S1. Excellent Mock Architecture
Every external dependency is properly mocked: Tesseract.js, JSON assets (via `vi.mock` with inline factories), localStorage, crypto, URL APIs. This makes the entire suite runnable in pure Node.js/JSDOM without any browser, OCR engine, or file system dependency.

### S2. Thorough Edge Case Coverage for Tested Functions
The suite goes well beyond happy paths. Examples:
- `videoDetector`: Tests null, undefined, numbers, objects, arrays, booleans, empty strings, concurrent calls
- `scanStorage`: Tests MAX_SESSIONS eviction (22 sessions → 20), QUOTA_EXCEEDED (4MB+ payload and QuotaExceededError), corrupted JSON, non-array JSON
- `scanDiff`: Tests null inputs, empty categories, missing category keys, fewer items in current than previous
- `gridEngine`: Tests zero dimensions, null dimensions, 720p/4K/10×10 resolutions

### S3. Clean Test Data Factory Pattern (scanDiff)
The `makeResults`, `pokemon`, `item`, `habitat`, `recipe` helper functions in `scanDiff.test.js` are a model pattern — they make test intent crystal clear while eliminating boilerplate:
```javascript
const previous = makeResults([pokemon('Pikachu')], [item('Potion')], [], []);
const current = makeResults([pokemon('Pikachu'), pokemon('Eevee')], [item('Potion')], [], []);
```

### S4. Priority-Labeled Test Organization
The P0/P1 labeling system tied to the test plan (`docs/test-plan.md`) creates traceability between risk assessment and test implementation. This is a professional practice rarely seen in project test suites.

### S5. Sub-Second Test Execution
At 825ms for 146 tests, the suite provides rapid feedback. This encourages frequent test runs during development and supports CI/CD integration without pipeline bottlenecks.

---

## 6. Recommendations Prioritized by Impact

### Tier 1 — High Impact, Moderate Effort

| # | Action | Files | Est. Effort | Impact |
|---|---|---|---|---|
| R1 | Add `scanVideo()` integration tests with mocked workers | ocrEngine.test.js | 3-4 hours | Covers the core feature |
| R2 | Add `scanGridVideo()` integration tests | gridEngine.test.js | 2-3 hours | Covers grid scanning |
| R3 | Add `detectVideoFPS()` unit tests | ocrEngine.test.js | 1 hour | Covers documented edge cases |

### Tier 2 — Medium Impact, Low Effort

| # | Action | Files | Est. Effort | Impact |
|---|---|---|---|---|
| R4 | Replace globalThis assignments with `vi.stubGlobal()` | gridEngine.test.js | 30 min | Eliminates isolation risk |
| R5 | Mock `Date` with `vi.useFakeTimers()` | scanStorage.test.js | 20 min | Eliminates flakiness risk |
| R6 | Extract shared mock fixtures | New fixtures file | 30 min | Reduces duplication |
| R7 | Fix manual mock restoration pattern | scanStorage.test.js | 15 min | Prevents cascading failures |

### Tier 3 — Low Impact, Low Effort

| # | Action | Files | Est. Effort | Impact |
|---|---|---|---|---|
| R8 | Add P0 labels to base tests | All files | 15 min | Improves traceability |
| R9 | Use smaller ImageData in gridEngine tests | gridEngine.test.js | 20 min | Faster test execution |
| R10 | Modernize assertion style | All files | 20 min | Better error messages |

---

## Appendix: Test Count by File

| File | Tests | Duration | Functions Covered | Functions Missing |
|---|---|---|---|---|
| ocrEngine.test.js | 44 | 183ms | matchText, mergeResults, getCategoryTotals, matchHabitatFrame, matchPokemonFrame, constants | scanVideo, detectVideoFPS |
| gridEngine.test.js | 35 | 429ms | classifyFrame, findRowShift, getGridDataList, detectGridParams | scanGridVideo |
| fuzzyMatch.test.js | 19 | 18ms | levenshtein, buildFuzzyMatcher (exactMatch, fuzzyMatch, findMatch) | — |
| scanStorage.test.js | 18 | 76ms | saveSession, loadSession, deleteSession, listSessions, loadLatestSession, clearAllSessions, estimateStorageUsage | — |
| videoDetector.test.js | 16 | 102ms | detectVideoType | — |
| scanDiff.test.js | 14 | 17ms | computeScanDiff, formatDiffSummary, buildNewItemSet | — |
| **Total** | **146** | **825ms** | | |
