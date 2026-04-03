# CI/CD Pipeline — Pokopia Scanner

## Overview

The project uses two GitHub Actions workflows to ensure code quality and automate deployment to GitHub Pages.

## Workflows

### 1. Tests (`test.yml`)

**Triggers:** Push to any branch, pull requests to `main`

**Purpose:** Run the full Vitest test suite on every code change to catch regressions early.

| Step | Command |
|---|---|
| Checkout | `actions/checkout@v4` |
| Setup Node 20 | `actions/setup-node@v4` (npm cache) |
| Install deps | `npm ci` |
| Run tests | `npx vitest run --reporter=verbose` |

### 2. Deploy (`deploy.yml`)

**Triggers:** Push to `main`, manual `workflow_dispatch`

**Purpose:** Build the production bundle and deploy to GitHub Pages — **only if tests pass first**.

| Step | Command |
|---|---|
| Checkout | `actions/checkout@v4` |
| Setup Node 20 | `actions/setup-node@v4` (npm cache) |
| Install deps | `npm ci` |
| **Run tests** | **`npm test`** (quality gate) |
| Build | `npm run build` (with env secrets) |
| Upload artifact | `actions/upload-pages-artifact@v3` |
| Deploy | `actions/deploy-pages@v4` |

**Quality Gate:** The `npm test` step runs `vitest run` before the build. If any test fails, the workflow stops and the site is **not** deployed.

## Environment Variables (Build-time)

Injected as GitHub repository secrets:

- `VITE_ADSENSE_CLIENT`
- `VITE_AD_SLOT_LANDING_TOP` / `VITE_AD_SLOT_LANDING_BOTTOM`
- `VITE_AD_SLOT_SCANNER_TOP` / `VITE_AD_SLOT_SCANNER_BOTTOM`
- `VITE_GA_MEASUREMENT_ID`
- `VITE_AD_PROVIDER`
- `VITE_ADSTERRA_DESKTOP_KEY` / `VITE_ADSTERRA_MOBILE_KEY`
- `VITE_BASE_PATH` — hardcoded to `/Pokopiascanner/`

## Test Suite

- **Framework:** Vitest 4.x with jsdom environment
- **Tests:** 146 across 6 test files
- **Execution time:** ~5.5s locally
- **Coverage areas:** fuzzyMatch, ocrEngine, gridEngine, videoDetector, scanStorage, scanDiff

## Pipeline Flow

```
push to main
  └─► test.yml ─► Run tests (any branch / PR)
  └─► deploy.yml
        ├─ npm ci
        ├─ npm test    ◄── QUALITY GATE (fail = no deploy)
        ├─ npm run build
        ├─ upload artifact
        └─ deploy to GitHub Pages
```

## Adding New Tests

1. Create test files in `src/utils/__tests__/` following the `*.test.js` convention
2. Tests run automatically on push — no configuration changes needed
3. Failed tests block deployment to production
