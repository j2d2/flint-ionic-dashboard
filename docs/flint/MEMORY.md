---
title: flint-ionic-dashboard — Agent Memory
date: 2026-05-26
auto_generated: true
source: generate_repo_memory
---

# Architecture
- **Components**: Thread-builder UI, Claude API ingest tool, Angular sidemenu/routing, backend API endpoints for forks.
- **Ports**: Backend runs on stabilized port (post-EADDRINUSE resolution); Angular dev server on default 4200.
- **Key Files**:  
  - `app-routing.module.ts` (routing fixes)  
  - `thread-builder/` (fork logic, draft status handling)  
  - `claude-api.service.ts` (LLM integration)  
  - `task-detail.page.html` (template fixes)  
  - `triage-runbook.md` (updated troubleshooting steps)

# Conventions
- **LLM Calls**: All LLM requests must use Flint's `query_claude_api` endpoint (rate-limit mitigation).
- **Fork Naming**: Default title format `{original title} (fork @ turn N)`; customizable via API.
- **Draft Status**: Forked threads are created with `draft` status by default.

# Active Work
- **Claude API Ingest**:  
  - Remaining tasks: Finalize Angular `thread-ingest.page`, add sidemenu entry/route, system wiring/restart.
  - Dependency: Flint `query_claude_api` endpoint integration.

# Recent Changes
- **Fork/Branch Feature** (2026-03-21):  
  - Implemented backend API + frontend UI for forked threads.  
  - Forked turns retain original turn IDs.  
  - Sticky footer and nav-sort issues resolved.
- **Claude API Integration** (2026-03-19):  
  - Backend + Angular ingest tool completed.  
  - Sidemenu/routing added.
- **Build Fixes** (2026-03-13):  
  - Removed extraneous SCSS from `home.page.scss`.  
  - Fixed duplicate `@NgModule` in `app-routing.module.ts`.  
  - Resolved EADDRINUSE port conflicts.

# Known Issues
- **Rate Limits**: GitHub Copilot limits still require strict use of `query_claude_api`.
- **Open Dependency**: Confirmation needed for Claude API task dependencies (session-2026-03-19).