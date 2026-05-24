---
title: flint-ionic-dashboard — Agent Memory
date: 2026-05-23
auto_generated: true
source: generate_repo_memory
---

# Architecture
- Angular frontend with Ionic components, SCSS styling, and TypeScript services
- Backend APIs for thread-builder (fork/branch) and Claude API integration (`query_claude_api` endpoint)
- SCSS cleanup: extraneous styles removed from `home.page.scss`
- Routing: fixed duplicate `@NgModule` in `app-routing.module.ts`, corrected `<ng-template>` in `task-detail.page.html`
- Ports: Angular dev server on 4200, backend on 3000 (resolved EADDRINUSE conflicts)
- Thread-builder includes draft fork creation, immutable turn IDs, and dynamic title generation (`{original} (fork @ turn N)`)

# Conventions
- All LLM calls must use `query_claude_api` endpoint to avoid GitHub Copilot rate limits
- Fork threads default to 'draft' status with auto-generated titles
- SCSS usage minimized; legacy styles removed via Python scripts
- API-first design for thread-builder features (backend-first implementation)

# Active Work
- Complete Angular thread-ingest page implementation
- Add sidemenu entry and route for ingest tool
- Wire Claude API integration and restart system
- Finalize vault documentation updates for ingest workflow

# Recent Changes
- **2026-03-21**: Fork/branch feature implemented (backend API + frontend UI for draft forks)
- **2026-03-19**: Claude API integration initiated; `query_claude_api` endpoint enforced
- **2026-03-13**: Build errors resolved (SCSS cleanup, routing fixes); port conflicts stabilized

# Known Issues
- Dependency confirmation pending for Claude API integration (March 19 open question)
- Sticky footer and signal reactivity issues resolved in March 21 session (no active status)

# Key Files
- `app-routing.module.ts` (routing fixes)
- `home.page.scss` (SCSS cleanup)
- `task-detail.page.html` (template corrections)
- `thread-builder` module (fork/branch logic, draft handling)
- `query_claude_api` endpoint (backend)
- Ingest tool components: Angular page, sidemenu entry, routing config