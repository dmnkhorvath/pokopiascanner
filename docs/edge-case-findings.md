# Edge Case Findings — Pokopia Scanner

**Date**: 2026-04-03  
**Files reviewed**: ocrEngine.js, gridEngine.js, fuzzyMatch.js, scanStorage.js, videoDetector.js  
**Total findings**: 30

## Summary by File

- **gridEngine.js**: 11 findings
- **ocrEngine.js**: 10 findings
- **scanStorage.js**: 4 findings
- **fuzzyMatch.js**: 3 findings
- **videoDetector.js**: 2 findings

## Detailed Findings

| # | Location | Trigger Condition | Guard Snippet | Potential Consequence |
|---|----------|-------------------|---------------|----------------------|
| 1 | `ocrEngine.js:275` | canvas.getContext('2d') returns null in offscreen/test environments | `const ctx = canvas.getContext('2d', opts); if (!ctx) throw new Error('Canvas 2D context unavailable');` | TypeError on ctx.drawImage at 10+ call sites |
| 2 | `ocrEngine.js:281` | cropRegion w or h is 0 → sw/sh = 0 | `const sw = Math.max(1, Math.floor((cropRegion.w / 100) * vw));` | Zero-size canvas; getImageData throws InvalidStateError |
| 3 | `ocrEngine.js:622` | matchText called before ensureOcrData completes; _matcher is null | `if (!_matcher) throw new Error('OCR data not initialized — call ensureOcrData first');` | TypeError: Cannot read property findMatch of null |
| 4 | `ocrEngine.js:911` | video.duration is NaN, Infinity, or 0 after loadedmetadata | `if (!isFinite(duration) \|\| duration <= 0) throw new Error('Invalid video duration');` | Infinite loop or NaN propagation through frame calculations |
| 5 | `ocrEngine.js:1006` | frameIntervalSec is 0 when autoDetect fails silently | `const frameIntervalSec = Math.max(0.001, frameIntervalMs / 1000);` | framesToProcess = Infinity → infinite allocation and OOM |
| 6 | `ocrEngine.js:661` | One worker in Promise.all fails; already-created workers leak | `Use Promise.allSettled, terminate fulfilled workers on any rejection` | Orphaned Tesseract workers consuming memory indefinitely |
| 7 | `ocrEngine.js:676` | One worker.terminate() throws; Promise.all rejects, rest not terminated | `await Promise.allSettled(workers.map(w => w.terminate()));` | Remaining workers leak on partial termination failure |
| 8 | `ocrEngine.js:130` | FPS detection: medianInterval near 0 → fps rounds to Infinity | `const fps = Math.min(240, Math.max(1, Math.round(1 / medianInterval)));` | frameIntervalMs = 0 → downstream division by zero |
| 9 | `ocrEngine.js:501` | matchHabitatFrame calls _matcher.findMatch but _matcher may be null | `if (!_matcher) return null;` | TypeError crash during habitat scanning |
| 10 | `ocrEngine.js:1035` | previewCanvas.getContext('2d') returns null | `const previewCtx = previewCanvas.getContext('2d'); if (!previewCtx) { /* skip preview */ }` | TypeError on drawImage crashes entire scan loop |
| 11 | `gridEngine.js:342` | normalizeProfile receives empty profile (n=0) | `if (n === 0) return new Float64Array(0);` | mean /= 0 → NaN; all downstream correlations become NaN |
| 12 | `gridEngine.js:320` | yEnd exceeds imageData height → OOB pixel read | `const safeYEnd = Math.min(yEnd, imageData.height);` | Reading undefined bytes from data array; silent garbage values |
| 13 | `gridEngine.js:320` | stripX is negative → pixel index underflows | `const safeStripX = Math.max(0, stripX);` | Negative array index reads undefined → NaN in profile |
| 14 | `gridEngine.js:396` | tx+tw or ty+th exceeds imageData dimensions | `const safeTw = Math.min(tw, width - tx); const safeTh = Math.min(th, Math.floor(data.length / 4 / width) - ty);` | OOB pixel access reads undefined → wrong fingerprint or crash |
| 15 | `gridEngine.js:590` | frameIntervalMs=0 in settings → frameIntervalSec=0 → infinite loop | `const frameIntervalSec = Math.max(0.001, frameIntervalMs / 1000);` | for-loop never terminates; browser tab hangs |
| 16 | `gridEngine.js:44` | Dataset entry has missing/malformed number field → parseInt returns NaN | `const na = parseInt(a.number?.replace('#', ''), 10) \|\| 0;` | NaN comparison → unstable sort order; position mapping breaks |
| 17 | `gridEngine.js:82` | videoWidth or videoHeight is 0 → all scaled params become 0 | `if (!videoWidth \|\| !videoHeight) throw new Error('Invalid video dimensions');` | Zero-size grid params → no tiles detected; silent empty results |
| 18 | `gridEngine.js:598` | canvas.getContext('2d') returns null | `const frameCtx = frameCanvas.getContext('2d', opts); if (!frameCtx) throw new Error('Canvas context unavailable');` | TypeError on drawImage crashes scan pipeline |
| 19 | `gridEngine.js:569` | seekVideo: 'seeked' event never fires and timeout resolves → frame not at expected time | `Log warning when timeout fires; consider rejecting or flagging stale frame` | Silent wrong-frame processing; incorrect tile classification |
| 20 | `gridEngine.js:1053` | getGridDataList called before ensureGridData; lists are empty arrays | `export async function getGridDataList(scanMode) { await ensureGridData(); ... }` | Returns empty array; UI shows 0 total items |
| 21 | `gridEngine.js:478` | fpNames is empty (fingerprint data missing) → bestIdx stays -1 | `if (fpNames.length === 0) return null;` | Always returns null; no items ever matched |
| 22 | `fuzzyMatch.js:52` | ocrLookup key is empty string → lower[0] is undefined | `if (lower.length === 0) continue;` | prefixIndex[undefined] created; pollutes index with bad entries |
| 23 | `fuzzyMatch.js:53` | ocrLookup key is single char → substring(0,2) returns 1 char | `const prefix = lower.length >= 2 ? lower.substring(0, 2) : lower;` | Duplicate index entries; minor memory waste and search overhead |
| 24 | `fuzzyMatch.js:45` | ocrLookup is null/undefined → Object.keys throws | `if (!ocrLookup \|\| typeof ocrLookup !== 'object') return { findMatch: () => null, exactMatch: () => null, fuzzyMatch: () => null };` | TypeError crashes matcher initialization |
| 25 | `scanStorage.js:19` | Corrupted localStorage: JSON.parse returns non-array (e.g. object) | `const sessions = JSON.parse(raw); if (!Array.isArray(sessions)) return [];` | sessions.sort is not a function → TypeError crash |
| 26 | `scanStorage.js:44` | crypto.randomUUID unavailable in insecure context (HTTP) | `const id = sessionId \|\| (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);` | TypeError: crypto.randomUUID is not a function |
| 27 | `scanStorage.js:101` | Corrupted session payload: JSON.parse returns unexpected shape | `const parsed = JSON.parse(raw); if (!parsed \|\| typeof parsed !== 'object') return null;` | Caller destructures missing properties → undefined propagation |
| 28 | `scanStorage.js:37` | results contains circular references → JSON.stringify throws | `Wrap JSON.stringify in try/catch; return null on serialization failure` | Unhandled TypeError; saveSession returns undefined instead of null |
| 29 | `videoDetector.js:105` | canvas.getContext('2d') returns null | `const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas context unavailable');` | TypeError on drawImage; frame extraction fails silently |
| 30 | `videoDetector.js:126` | Negative x or y passed to regionAvgRGB → OOB pixel index | `const x1 = Math.max(0, x); const y1 = Math.max(0, y);` | Reads garbage pixel data; misclassifies video type |

---

## Findings by Severity

### 🔴 High — Can crash the scan pipeline

- **#1** `ocrEngine.js:275` — canvas.getContext('2d') returns null in offscreen/test environments
- **#3** `ocrEngine.js:622` — matchText called before ensureOcrData completes; _matcher is null
- **#4** `ocrEngine.js:911` — video.duration is NaN, Infinity, or 0 after loadedmetadata
- **#5** `ocrEngine.js:1006` — frameIntervalSec is 0 when autoDetect fails silently
- **#9** `ocrEngine.js:501` — matchHabitatFrame calls _matcher.findMatch but _matcher may be null
- **#10** `ocrEngine.js:1035` — previewCanvas.getContext('2d') returns null
- **#14** `gridEngine.js:396` — tx+tw or ty+th exceeds imageData dimensions
- **#15** `gridEngine.js:590` — frameIntervalMs=0 in settings → frameIntervalSec=0 → infinite loop
- **#18** `gridEngine.js:598` — canvas.getContext('2d') returns null
- **#24** `fuzzyMatch.js:45` — ocrLookup is null/undefined → Object.keys throws
- **#25** `scanStorage.js:19` — Corrupted localStorage: JSON.parse returns non-array (e.g. object)
- **#26** `scanStorage.js:44` — crypto.randomUUID unavailable in insecure context (HTTP)
- **#28** `scanStorage.js:37` — results contains circular references → JSON.stringify throws
- **#29** `videoDetector.js:105` — canvas.getContext('2d') returns null

### 🟡 Medium — Silent wrong results

- **#4** `ocrEngine.js:911` — video.duration is NaN, Infinity, or 0 after loadedmetadata
- **#11** `gridEngine.js:342` — normalizeProfile receives empty profile (n=0)
- **#12** `gridEngine.js:320` — yEnd exceeds imageData height → OOB pixel read
- **#13** `gridEngine.js:320` — stripX is negative → pixel index underflows
- **#14** `gridEngine.js:396` — tx+tw or ty+th exceeds imageData dimensions
- **#16** `gridEngine.js:44` — Dataset entry has missing/malformed number field → parseInt returns NaN
- **#17** `gridEngine.js:82` — videoWidth or videoHeight is 0 → all scaled params become 0
- **#19** `gridEngine.js:569` — seekVideo: 'seeked' event never fires and timeout resolves → frame not at expected time
- **#20** `gridEngine.js:1053` — getGridDataList called before ensureGridData; lists are empty arrays
- **#22** `fuzzyMatch.js:52` — ocrLookup key is empty string → lower[0] is undefined
- **#27** `scanStorage.js:101` — Corrupted session payload: JSON.parse returns unexpected shape
- **#28** `scanStorage.js:37` — results contains circular references → JSON.stringify throws
- **#29** `videoDetector.js:105` — canvas.getContext('2d') returns null
- **#30** `videoDetector.js:126` — Negative x or y passed to regionAvgRGB → OOB pixel index

### 🟢 Low — Minor or unlikely

- **#22** `fuzzyMatch.js:52` — ocrLookup key is empty string → lower[0] is undefined
- **#23** `fuzzyMatch.js:53` — ocrLookup key is single char → substring(0,2) returns 1 char
