# Playwright Migration & AI Optimization — Ionic/Angular

> **From**: Cypress
> **To**: Playwright + Playwright MCP + Copilot/Claude AI workflow
> **Stack**: Angular · Ionic/Capacitor · TypeScript
> **Branch**: `e2e/playwright`

> **Detailed plan & progress**: [`docs/testing/e2e/PLAN.md`](./e2e/PLAN.md) · [`docs/testing/e2e/PROGRESS.md`](./e2e/PROGRESS.md)

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| **1** | Foundation & Framework | ✅ Complete |
| **2** | Smoke Tests | ✅ Complete |
| **3** | Auth Tests | ⬜ Next |
| **4** | Sites Routing Tests | ⬜ Pending |
| **5** | Feature Tests | ⬜ Pending |
| **6** | Persistence & Bug Regression Tests | ⬜ Pending |
| **7** | CI Integration | ⬜ Pending |
| **8** | Decommission Cypress | ⬜ Pending |

### What's in place

- `playwright.config.ts` — `390×844` viewport (iPhone 14 Pro), 3 projects (chromium, ios-sim, android), `reuseExistingServer` for local dev
- `e2e/src/helpers/ionic.ts` — `ionClick`, `disableIonicAnimations`, `waitForRoute`, `clearAppData`, `waitForDbReady`, `waitForSitesLoaded`
- `e2e/src/fixtures/app-context.ts` — `freshPage`, `demoPage`, `personPage` fixtures (replaces all Cypress custom commands)
- `e2e/src/smoke.spec.ts` — 6 smoke tests ported, `freshPage` fixture
- `npm run pw:*` scripts — `pw`, `pw:ui`, `pw:headed`, `pw:smoke`, `pw:chromium`, `pw:ios`, `pw:report`, `pw:codegen`
- `data-cy` → `data-test` renamed across all 19 HTML templates + 11 Cypress test files
- `.vscode/mcp.json` — Playwright MCP for live DOM inspection in Copilot/Claude

### Cypress command → Playwright fixture map

| Cypress | Playwright |
|---|---|
| `cy.setupDemoSession()` | `{ demoPage: page }` fixture |
| `cy.setupPersonSession(id)` | `setupPersonSession(page, id)` from `app-context.ts` |
| `cy.waitForDbReady()` | `waitForDbReady(page)` from `helpers/ionic.ts` |
| `cy.waitForSitesLoaded()` | `waitForSitesLoaded(page)` from `helpers/ionic.ts` |
| `cy.get('[data-cy="x"]')` | `page.locator('[data-test="x"]')` |
| `cy.visit('/path')` | `page.goto('/path')` |
| `cy.url().should('include', x)` | `expect(page.url()).toContain(x)` |

---

## Next Steps — Picking Up in VS Code

### Run smoke tests first to validate the stack
```bash
npm run pw:smoke -- --project=chromium --headed
```
All 6 smoke tests should go green against the running dev server. If any fail, check the
`playwright-report/` HTML output: `npm run pw:report`.

### Phase 3 — Port `auth.cy.ts`
```
cypress/e2e/auth.cy.ts → e2e/src/auth.spec.ts
```
- Uses `demoPage` and/or `personPage` fixtures
- Key pattern: `cy.setupDemoSession()` → `{ demoPage: page }`
- Key pattern: `cy.setupPersonSession(70722)` → `await setupPersonSession(page, 70722)`

### Phase 4 — Port routing tests (largest block)
```
cypress/e2e/sites-panel-routing.cy.ts   → e2e/src/sites-panel-routing.spec.ts
cypress/e2e/observe-flow-routing.cy.ts  → e2e/src/observe-flow-routing.spec.ts
cypress/e2e/sites-routing-complete.cy.ts → e2e/src/sites-routing-complete.spec.ts
```
Watch for mid-animation assertions — add `await disableIonicAnimations(page)` after any
`page.goto()` inside test bodies, not just in the fixture.

### Using Playwright MCP for authoring
With the dev server running, ask Copilot or Claude:
```
Open http://localhost:8100/sites and generate a Playwright spec for the
sites list — verify site cards load and tapping one opens the site panel.
Use data-test selectors and the demoPage fixture from app-context.ts.
```
The MCP server navigates the live app and returns real DOM snapshots — no guessing selectors.

### Verify Cypress is still green after each phase
```bash
npm run e2e:smoke
```

---

## 1. Install

```bash
npm install -D @playwright/test
npx playwright install chromium webkit
```

Remove Cypress (optional but clean):
```bash
npm uninstall cypress @types/cypress
rm -rf cypress cypress.config.ts
```

---

## 2. `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] ?? 'http://localhost:8100';

export default defineConfig({
  testDir: './e2e/src',
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['html'], ['list']],

  use: {
    baseURL,
    viewport: { width: 430, height: 932 }, // full-height — critical for ion-footer
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium', // default — fast, AI-assisted dev loop
      use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 932 } },
    },
    {
      name: 'ios-sim',  // WebKit ≈ Safari/WKWebView; run with --project=ios-sim
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'android',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'ionic serve --no-open',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
```

---

## 3. Ionic-Specific Helpers (`e2e/src/helpers/ionic.ts`)

Ionic's shadow DOM and `ion-footer` position:fixed break standard Playwright interactions.
These helpers fix the two most common failure modes.

```typescript
import { type Page } from '@playwright/test';

/**
 * Click any element reliably — works inside ion-footer and Ionic overlays.
 * Playwright's locator.click() fails on position:fixed elements in ion-footer.
 */
export async function ionClick(page: Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: 'attached' });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`ionClick: element not found for "${sel}"`);
    (el as HTMLElement).click();
  }, selector);
}

/**
 * Disable Ionic transition animations for this page context.
 * Call once after goto() — prevents assertions firing mid-animation.
 * This is the #1 source of Playwright flakiness in Ionic apps.
 */
export async function disableIonicAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      * { transition: none !important; animation: none !important; }
      ion-modal, ion-alert, ion-toast, ion-loading, ion-action-sheet {
        --backdrop-opacity: 0 !important;
      }
    `,
  });
}

/**
 * Wait for the URL to contain a path fragment.
 */
export async function waitForRoute(page: Page, route: string, timeout = 6000): Promise<void> {
  await page.waitForURL(`**${route}**`, { timeout });
}

/**
 * Clear all browser storage — simulates a fresh install.
 */
export async function clearAppData(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.deleteDatabase('_ionicstorage');
    indexedDB.deleteDatabase('_ionickv');
  });
  await page.context().clearCookies();
}
```

---

## 4. Data Contexts via Fixtures (`e2e/src/fixtures/app-context.ts`)

Fixtures replace Cypress `beforeEach` boilerplate. Each fixture delivers a page at
a known application state; tests pick the lowest-state fixture they need.

```typescript
import { test as base, expect, type Page } from '@playwright/test';
import { clearAppData, disableIonicAnimations } from '../helpers/ionic';

// Override with env vars: BASE_URL, TEST_PIN, TEST_NETWORK
export const TEST_PIN = process.env['TEST_PIN'] ?? '1234';

async function freshInstall(page: Page): Promise<void> {
  await page.goto('/');
  await clearAppData(page);
  await disableIonicAnimations(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await disableIonicAnimations(page); // re-inject after navigation
}

// async function loggedIn(page: Page): Promise<void> { ... }
// async function onboarded(page: Page): Promise<void> { ... }

type AppFixtures = {
  freshPage: Page;
  // loggedInPage: Page;
};

export const test = base.extend<AppFixtures>({
  freshPage: async ({ page }, use) => {
    await freshInstall(page);
    await use(page);
  },
});

export { expect };
```

**Always import `test` and `expect` from your fixtures, not from `@playwright/test`:**
```typescript
// ✅ Correct
import { test, expect } from '../fixtures/app-context';

// ❌ Wrong — skips fixture setup
import { test, expect } from '@playwright/test';
```

---

## 5. Page Object Model (per page with >3 interactions)

```typescript
// e2e/src/pages/home.page.ts
import { type Page, type Locator } from '@playwright/test';
import { ionClick } from '../helpers/ionic';

export class HomePage {
  readonly balanceDisplay: Locator;
  readonly sendBtn: Locator;
  readonly receiveBtn: Locator;

  constructor(readonly page: Page) {
    this.balanceDisplay = page.locator('[data-test="balance-display"]');
    this.sendBtn        = page.locator('[data-test="send-btn"]');
    this.receiveBtn     = page.locator('[data-test="receive-btn"]');
  }

  async tapSend(): Promise<void> {
    await ionClick(this.page, '[data-test="send-btn"]');
  }
}
```

---

## 6. Selector Rules

| Pattern | Use | Notes |
|---------|-----|-------|
| `[data-test="my-btn"]` | ✅ Always prefer | Add to Angular template |
| `ion-button > button` | ✅ Shadow pierce | When no data-test |
| `button.button-native` | ❌ Fragile | Ionic internals change |
| `.my-css-class` | ❌ Fragile | Styling changes break tests |

Add `data-test` in the Angular template:
```html
<ion-button data-test="send-btn">Send</ion-button>
```

---

## 7. Playwright MCP — Live DOM for AI Assistants

### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--browser", "chromium"],
      "type": "stdio"
    }
  }
}
```

To use: start your dev server, then in Copilot Chat (agent mode):
```
Open http://localhost:8100/home and generate a Playwright spec for the
send flow — fill address, enter amount, confirm. Use data-test selectors.
```
The MCP server navigates the live app and gives Copilot real DOM snapshots
instead of guessing — no wrong selectors, no hallucinated element structure.

### Claude (`claude_desktop_config.json` or Claude MCP settings)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--browser", "chromium"]
    }
  }
}
```

---

## 8. AI Test Generation — Copilot Prompt Skill (`.github/prompts/pw-test.prompt.md`)

Create this file so `/pw-test` in Copilot agent mode generates correct specs every time:

```markdown
---
mode: agent
description: Generate a Playwright E2E spec for an Ionic/Angular page or flow.
applyTo: e2e/src/**/*.spec.ts
---

# Playwright Test Generator — Ionic/Angular

## Rules
1. Use `data-test` attributes for all selectors.
2. Pierce shadow DOM: `ion-button > button`, not `.button-native`.
3. Use `ionClick()` for any element in `ion-footer` or Ionic overlays.
4. Import `test` and `expect` from `../fixtures/app-context`, NOT from `@playwright/test`.
5. Pick the lowest-state fixture that satisfies the test.
6. One assertion per `test()`. Group with `test.describe()`.
7. Use `waitForRoute()` for navigation assertions, not `waitForURL` directly.
8. No `page.waitForTimeout()` — use `waitForSelector` or `waitForURL`.

## Fixture reference
| Fixture | Pre-condition |
|---------|--------------|
| `freshPage` | Clean storage, app start |
| `loggedInPage` | Authenticated user |

## Output format
\`\`\`typescript
import { test, expect } from '../fixtures/app-context';
import { ionClick, waitForRoute } from '../helpers/ionic';

test.describe('<Feature>', () => {
  test('<assertion>', async ({ <fixture>: page }) => {
    // ...
  });
});
\`\`\`
```

Usage in Copilot Chat:
```
/pw-test Generate a spec for the settings page — network toggle and logout button.
```

---

## 9. Token-Efficient AI Workflow

| Situation | Best approach |
|-----------|--------------|
| New spec, known page | `/pw-test` prompt — no browser needed |
| Unknown DOM / new page | Playwright MCP — AI inspects live DOM |
| Test failing, unclear why | Open `--ui` or paste `show-trace` output into Chat |
| Selector guessing | `npx playwright codegen http://localhost:8100` then clean up |
| CI pipeline | Plain `npx playwright test` — no MCP overhead |

---

## 10. Quick Reference Commands

```bash
npx playwright test                          # run all
npx playwright test --ui                     # visual debugger (best for authoring)
npx playwright test --headed                 # watch browser
npx playwright test --grep="Home"            # single spec
npx playwright test --project=ios-sim        # WebKit / Safari
npx playwright test --update-snapshots       # regenerate golden screenshots
npx playwright codegen http://localhost:8100 # record interactions → generate test
npx playwright show-report                   # open HTML report
npx playwright show-trace test-results/*/trace.zip
```

---

## 11. CI (`github/workflows/e2e.yml`)

```yaml
name: E2E
on: [push, pull_request]
jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium webkit
      - run: npx playwright test
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## File Structure

### Current (Phase 2 complete)

```
e2e/
└── src/
    ├── fixtures/
    │   └── app-context.ts       ← always import test/expect from here
    ├── helpers/
    │   └── ionic.ts             ← ionClick, disableIonicAnimations, waitForRoute,
    │                               clearAppData, waitForDbReady, waitForSitesLoaded
    ├── pages/                   ← Page Object Models (add as phases progress)
    └── smoke.spec.ts            ✅ ported
playwright.config.ts             ✅ in place
.vscode/
└── mcp.json                     ✅ Playwright MCP for live DOM inspection
docs/testing/e2e/
├── PLAN.md                      ✅ full migration plan
└── PROGRESS.md                  ✅ phase-by-phase tracker
```

### End state (Phase 8)

```
e2e/
└── src/
    ├── fixtures/
    │   └── app-context.ts
    ├── helpers/
    │   └── ionic.ts
    ├── pages/
    │   ├── sites.page.ts
    │   └── observation.page.ts
    ├── smoke.spec.ts
    ├── auth.spec.ts
    ├── sites-panel-routing.spec.ts
    ├── observe-flow-routing.spec.ts
    ├── sites-routing-complete.spec.ts
    ├── sites.spec.ts
    ├── observations.spec.ts
    ├── animals-visibility.spec.ts
    ├── indiv-fields-deselect.spec.ts
    ├── visit-details-persistence.spec.ts
    ├── protocol-level-persistence.spec.ts
    ├── bug-site-images-display.spec.ts
    └── timer-resume.spec.ts
playwright.config.ts
.github/
├── workflows/
│   └── e2e.yml                  ← CI pipeline
└── prompts/
    └── pw-test.prompt.md        ← /pw-test slash command for Copilot
.vscode/
└── mcp.json                     ← Playwright MCP for live DOM inspection
```
