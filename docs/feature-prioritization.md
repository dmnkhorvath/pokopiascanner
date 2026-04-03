# Pokopia Scanner — Feature Prioritization

> Generated: 2026-04-03 | Method: RICE Framework (Reach × Impact × Confidence / Effort)

## Scoring Criteria

| Dimension | Scale | Anchor Points |
|-----------|-------|---------------|
| **Reach** | 1–10 | 1 = <5% of users, 5 = ~50%, 10 = virtually everyone |
| **Impact** | 1–10 | 1 = barely noticeable, 5 = solid improvement, 10 = transformative |
| **Confidence** | 1–10 | 1 = pure speculation, 5 = some evidence, 10 = proven pattern |
| **Effort** | 1–10 | 1 = <1 day, 3 = ~1 week, 5 = ~2 weeks, 8 = ~1 month, 10 = multi-month |
| **RICE** | — | (Reach × Impact × Confidence) / Effort — higher is better |

---

## 1. Scored Feature Table (sorted by RICE)

| Rank | Feature | Reach | Impact | Confidence | Effort | RICE | Tier |
|------|---------|-------|--------|------------|--------|------|------|
| 1 | Smart Recording Guide | 8 | 6 | 9 | 2 | **216.0** | 🟢 T1 |
| 2 | Scan Diff / What's New | 8 | 7 | 9 | 3 | **168.0** | 🟢 T1 |
| 3 | Missing Item Helper | 7 | 7 | 8 | 3 | **130.7** | 🟢 T1 |
| 4 | Icon Sprite Sheets | 9 | 3 | 9 | 2 | **121.5** | 🟢 T1 |
| 5 | Manual Review Queue | 7 | 8 | 8 | 4 | **112.0** | 🟢 T1 |
| 6 | Dark Mode | 7 | 3 | 10 | 2 | **105.0** | 🟡 T2 |
| 7 | PWA / Add to Home Screen | 6 | 5 | 9 | 3 | **90.0** | 🟡 T2 |
| 8 | Web Worker OCR Pipeline | 9 | 5 | 8 | 4 | **90.0** | 🟡 T2 |
| 9 | Scan History Timeline | 6 | 5 | 8 | 4 | **60.0** | 🟡 T2 |
| 10 | Share Progress Card | 5 | 4 | 8 | 3 | **53.3** | 🟡 T2 |
| 11 | Image Recognition | 9 | 9 | 5 | 9 | **45.0** | 🟠 T3 |
| 12 | Offline Mode | 5 | 4 | 7 | 4 | **35.0** | 🟠 T3 |
| 13 | Localization (i18n) | 4 | 4 | 7 | 6 | **18.7** | 🟠 T3 |
| 14 | Cloud Sync | 4 | 6 | 6 | 8 | **18.0** | 🔴 T4 |
| 15 | Live Camera Scan | 3 | 5 | 4 | 8 | **7.5** | 🔴 T4 |
| 16 | Community Stats | 3 | 3 | 5 | 7 | **6.4** | 🔴 T4 |
| 17 | Multi-game Support | 2 | 3 | 4 | 9 | **2.7** | 🔴 T4 |

---

## 2. Tier Grouping

### 🟢 Tier 1 — Build Next (RICE ≥ 110)

These features deliver the highest value per unit of effort and directly improve the core scanning experience.

| # | Feature | RICE | Rationale |
|---|---------|------|-----------|
| 1 | **Smart Recording Guide** | 216.0 | Prevents the #1 failure mode: bad recordings. Every new user benefits. Minimal dev effort — mostly content + UI. Reduces support burden and failed scans dramatically. |
| 2 | **Scan Diff / What's New** | 168.0 | The killer feature for returning users. "I scanned again — what did I find?" is the natural next question after any scan. Straightforward to implement by diffing localStorage snapshots. |
| 3 | **Missing Item Helper** | 130.7 | Completionists (the core audience) will love this. "You're missing 5 recipes — here's where to find them" with pokopiadex.com links turns the scanner from a tracker into a guide. |
| 4 | **Icon Sprite Sheets** | 121.5 | Pure performance win. Currently loading 1,200+ individual icon files. Combining into sprite sheets cuts HTTP requests by 95%+ and improves initial load time for everyone. Low risk, high confidence. |
| 5 | **Manual Review Queue** | 112.0 | Directly addresses accuracy — the core value proposition. Low-confidence matches currently either silently appear or silently disappear. Letting users confirm/dismiss builds trust and improves data quality. |

### 🟡 Tier 2 — Build Soon (RICE 50–109)

Solid improvements that enhance polish, performance, and engagement but aren't critical path.

| # | Feature | RICE | Rationale |
|---|---------|------|-----------|
| 6 | **Dark Mode** | 105.0 | Near-zero effort with DaisyUI theme toggle. High user expectation for any modern web app. Quick win. |
| 7 | **PWA / Add to Home Screen** | 90.0 | Makes the app feel native on mobile. Service worker + manifest is well-documented. Pairs naturally with Offline Mode later. |
| 8 | **Web Worker OCR Pipeline** | 90.0 | Moves heavy OCR processing off the main thread. Currently the UI can stutter during scanning. Improves perceived performance for everyone. |
| 9 | **Scan History Timeline** | 60.0 | Visual progress over time. Builds on Scan Diff data. Motivates continued use ("I went from 40% to 78% in 2 weeks"). |
| 10 | **Share Progress Card** | 53.3 | Social/viral feature. Canvas-based image generation is well-understood. Drives organic discovery. Best built after the dashboard is polished. |

### 🟠 Tier 3 — Build Later (RICE 15–49)

Valuable but either high-effort, uncertain, or serving a smaller audience.

| # | Feature | RICE | Rationale |
|---|---------|------|-----------|
| 11 | **Image Recognition** | 45.0 | Potentially transformative but massive effort and uncertain accuracy. The existing fingerprint matching (gridEngine) is a stepping stone. Revisit after real gameplay videos validate the current approach. |
| 12 | **Offline Mode** | 35.0 | Nice-to-have but most users will have connectivity when scanning. Natural extension of PWA work. |
| 13 | **Localization (i18n)** | 18.7 | Pokopia is a global game, but the English-speaking audience is primary. i18n framework should be added early (low cost) but translations can wait for demand signals. |

### 🔴 Tier 4 — Maybe / Never (RICE < 15)

Either too expensive, too speculative, or serving too small an audience to justify near-term investment.

| # | Feature | RICE | Rationale |
|---|---------|------|-----------|
| 14 | **Cloud Sync** | 18.0 | Requires a backend (auth, database, API). Fundamentally changes the project from static site to full-stack app. localStorage + JSON export/import covers 90% of the use case. |
| 15 | **Live Camera Scan** | 7.5 | Cool demo but impractical. Camera-to-screen OCR is unreliable (glare, angle, resolution). Recording is the better workflow. |
| 16 | **Community Stats** | 6.4 | Requires backend + privacy considerations. Small audience. Could be approximated with a simple survey or Discord poll. |
| 17 | **Multi-game Support** | 2.7 | Each game has different UI, data structures, and scanning requirements. The abstraction cost is enormous. Better to nail Pokopia first and fork if demand emerges. |

---

## 3. Recommended Build Order

### Phase 1: Core Experience Polish (Weeks 1–2)

```
1. Smart Recording Guide          ~2 days    [no dependencies]
2. Dark Mode                      ~0.5 days  [no dependencies]
3. Icon Sprite Sheets              ~1.5 days  [no dependencies]
```

**Rationale**: Three quick wins that immediately improve first-use experience (guide), visual polish (dark mode), and performance (sprites). All are independent and can be parallelized.

### Phase 2: Accuracy & Trust (Weeks 2–3)

```
4. Manual Review Queue             ~4 days    [no dependencies]
5. Scan Diff / What's New          ~3 days    [depends on stable scan data model]
```

**Rationale**: Review Queue addresses the accuracy gap — users can now verify uncertain matches. Scan Diff requires a stable data model (which Review Queue helps solidify by cleaning up false positives).

### Phase 3: Engagement & Retention (Weeks 3–5)

```
6. Missing Item Helper             ~3 days    [depends on dataset having location data]
7. Web Worker OCR Pipeline         ~4 days    [no dependencies, but test after Review Queue]
8. Scan History Timeline           ~4 days    [depends on Scan Diff infrastructure]
```

**Rationale**: Missing Item Helper turns passive tracking into active guidance. Web Worker improves scanning UX. History Timeline builds on the diff infrastructure from Phase 2.

### Phase 4: Distribution & Growth (Weeks 5–7)

```
9.  PWA / Add to Home Screen       ~3 days    [no dependencies]
10. Share Progress Card             ~3 days    [depends on dashboard being polished]
11. Offline Mode                    ~3 days    [depends on PWA service worker]
```

**Rationale**: PWA makes the app installable. Share Card drives organic growth. Offline Mode extends the PWA foundation.

### Phase 5: Advanced (Weeks 8+)

```
12. Image Recognition               ~3-4 weeks [depends on real gameplay video analysis]
13. Localization (i18n)              ~1-2 weeks [no hard dependencies]
```

**Rationale**: Image Recognition is the big bet — only pursue after validating the current OCR + fingerprint approach with real gameplay footage. i18n can be added whenever community demand justifies it.

### Deferred Indefinitely

```
14. Cloud Sync                      [requires backend architecture decision]
15. Live Camera Scan                [requires camera OCR R&D]
16. Community Stats                 [requires backend + privacy framework]
17. Multi-game Support              [requires significant abstraction work]
```

---

## 4. Dependency Map

```
Smart Recording Guide ──────────────────────────────────────── (independent)
Dark Mode ──────────────────────────────────────────────────── (independent)
Icon Sprite Sheets ─────────────────────────────────────────── (independent)
Manual Review Queue ────────────────────────────────────────── (independent)
    │
    └──► stabilizes scan data model
            │
            ├──► Scan Diff / What's New
            │       │
            │       └──► Scan History Timeline
            │
            └──► Missing Item Helper (needs clean match data)

Web Worker OCR Pipeline ────────────────────────────────────── (independent)
    │
    └──► smoother scanning UX
            │
            └──► Image Recognition (builds on worker architecture)

PWA / Add to Home Screen ──────────────────────────────────── (independent)
    │
    └──► Offline Mode (extends service worker)

Share Progress Card ────────────────────────────────────────── (needs polished dashboard)

Localization (i18n) ────────────────────────────────────────── (independent, but touch all UI)

Cloud Sync ─────────────────────────────────────────────────── (requires backend)
    │
    └──► Community Stats (requires backend + aggregation)

Live Camera Scan ───────────────────────────────────────────── (independent R&D)
Multi-game Support ─────────────────────────────────────────── (requires abstraction layer)
```

---

## 5. Quick Wins (High RICE, Low Effort)

Features scoring RICE ≥ 100 with Effort ≤ 3:

| Feature | RICE | Effort | Time Estimate | Why It's Quick |
|---------|------|--------|---------------|----------------|
| **Smart Recording Guide** | 216.0 | 2 | ~2 days | Content + simple UI component. No complex logic. |
| **Scan Diff / What's New** | 168.0 | 3 | ~3 days | Compare two JSON snapshots. UI is a filtered list. |
| **Missing Item Helper** | 130.7 | 3 | ~3 days | Invert the found set, link to pokopiadex.com. |
| **Icon Sprite Sheets** | 121.5 | 2 | ~1.5 days | Build script to combine icons + CSS sprite classes. |
| **Dark Mode** | 105.0 | 2 | ~0.5 days | DaisyUI theme toggle. Possibly a single line of config. |

These 5 features together represent ~10 days of work and would dramatically improve the user experience across onboarding, performance, accuracy feedback, and visual polish.

---

## Summary

The highest-leverage investment is in **reducing failed scans** (Smart Recording Guide), **showing progress delta** (Scan Diff), and **guiding completionists** (Missing Item Helper). These three features alone transform the scanner from a one-shot tool into a companion app that users return to repeatedly.

Performance improvements (Sprite Sheets, Web Worker) and polish (Dark Mode, PWA) round out the near-term roadmap. The ambitious features (Image Recognition, Cloud Sync, Multi-game) should be deferred until the core experience is validated with real gameplay footage and user feedback.
