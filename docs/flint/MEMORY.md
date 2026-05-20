---
title: flint-ionic-dashboard — Agent Memory
date: 2026-05-20
auto_generated: true
source: generate_repo_memory
---

# Architecture
- Angular frontend with Ionic components for thread-builder and task-detail pages
- Backend API endpoints for thread forking (`POST /fork-thread`) and Claude API integration (`POST /query_claude_api`)
- Sidemenu navigation with dynamic routing for tools (ingest, thread-builder)
- Ports: Angular frontend **18320**, Express backend **18310** (port policy: 183xx range, never defaults like 4200/3000/8100)

# Conventions
- All LLM calls must use `query_claude_api` endpoint (rate-limit mitigation)
- Forked threads use draft status and title format: `{original title} (fork @ turn N)`
- Angular routing requires unique `@NgModule` declarations in `app-routing.module.ts`
- SCSS cleanup: Remove unused styles (e.g., `home.page.scss`)

# Active Work
- Complete Angular thread-ingest page implementation
- Wire Claude API ingest tool with sidemenu entry and routing
- Validate dependency integrations for API tasks

# Recent Changes
- **2026-03-21**: Fork/branch feature added (draft threads, retained turn IDs, UI/UX updates)
- **2026-03-19**: Claude API integration for LLM calls; ingest tool backend/page started
- **2026-03-13**: Build errors resolved (SCSS removal, routing fixes); port conflicts stabilized

# Known Issues
- Open question: Dependency validation for Claude API ingest pipeline
- Angular template warnings in `task-detail.page.html` (ensure `</ion-content>` closure)
- Triage runbook requires updates for new fork/branch workflows

# Key Files
- `src/app/thread-builder/` (fork logic, UI components)
- `src/app/app-routing.module.ts` (routing configuration)
- `src/assets/styles/home.page.scss` (cleaned SCSS)
- `src/services/claud-api.service.ts` (LLM integration)
- `src/pages/task-detail/task-detail.page.html` (template fixes)