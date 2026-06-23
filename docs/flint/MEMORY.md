---
title: flint-ionic-dashboard — Agent Memory
date: 2026-06-23
auto_generated: true
source: generate_repo_memory
---

```markdown
# flint-ionic-dashboard — Agent Memory
date: 2026-06-23
auto_generated: true
source: generate_repo_memory

# Architecture
* **Core Components:** Angular (frontend), Node.js/Express (backend), TypeScript, Ionic Framework.
* **Key Ports:**  Frontend communicates via RESTful APIs (primarily GraphQL). Backend exposes endpoints for thread management, Claude API integration, and data retrieval. Specific port numbers are documented in `Projects/Apps/flint-ionic-dashboard.md`.
* **Data Storage:** Relies on a centralized vault system for documentation and configuration. Thread state is persisted within the backend database (details undocumented).
* **UI Structure:** Modular Angular components organized around thread management, data visualization, and user interaction.

# Conventions
* **Code Style:** Strict adherence to TypeScript coding standards. Utilize ESLint and Prettier for consistent formatting.
* **API Design:** All API requests utilize GraphQL queries.  `query_claude_api` endpoint is mandatory for all LLM interactions.
* **Branching Strategy:** Git flow with feature branches for new development, utilizing `feat(...)` commit messages.  Fork/branch functionality implemented as a core feature.
* **Error Handling:** Implement robust error handling and logging throughout the application.

# Active Work
* **Claude API Integration (High Priority):** Completion of the backend and Angular page for the flint-ionic-dashboard ingest tool, including sidemenu and routing. Remaining tasks: thread-ingest page creation, sidemenu entry/route implementation, system restart.  Utilizing Claude API to drive this process and update vault documentation.
* **Fork/Branch Feature (Completed):** Fully functional fork/branch capability implemented with draft threads and customizable titles. Backend API endpoints and frontend UI components are in place.

# Recent Changes
* **2026-03-21:** Session Summary – Stabilized thread-builder UI, introduced fork/branch feature. Key decisions: drafts for new forks, '{original title} (fork @ turn N)' default titles, retained original turn IDs. Commit: `feat(thread-builder): implement fork/branch feature`.
* **2026-03-19:** Session Summary – Integrated Claude API ingest tool; enforced use of `query_claude_api` endpoint. Decisions: all LLM calls via this endpoint, Claude API for remaining tasks and documentation updates. Commit: `feat(tools): integrate claude api ingest`.
* **2026-03-13:** Session Summary – Resolved build errors and port conflicts in the Flint dashboard. Key fixes: SCSS cleanup (Python), duplicate `@NgModule` block correction, added closing content tags & notFound template. Commit: `fix(angular): resolve build errors and port conflicts`.

# Known Issues
* **Claude API Rate Limits:** The reliance on `query_claude_api` remains a potential bottleneck due to GitHub Copilot rate limits. Continuous monitoring of API usage is required.
* **Vault Documentation Gaps:**  Detailed documentation for the backend database schema, specific API endpoints beyond those exposed in the frontend, and advanced configuration options are currently lacking.
* **Dependency Integration Verification:** Confirmation that all dependencies are correctly integrated requires further investigation.

# Key Files
* `Projects/Apps/flint-ionic-dashboard/src/app/home/home.page.ts`:  Primary entry point for the dashboard application.
* `Projects/Apps/flint-ionic-dashboard/src/app/thread-builder/thread-builder.module.ts`: Module containing the thread builder UI components.
* `Projects/Apps/flint-ionic-dashboard/src/app/task-detail/task-detail.page.html`: Template for displaying individual task details, including the notFound template.
* `Projects/Apps/flint-ionic-dashboard/src/app/task-detail/task-detail.page.scss`: SCSS styles associated with the task detail page.
* `Projects/Tools/flint-ionic-dashboard/src/index.ts`: Entry point for the ingest tool backend.
* `docs/flint/session-2026-03-21-implement-fork-branch-feature.md`: Session summary detailing the fork/branch feature implementation.
* `docs/flint/session-2026-03-19-integrate-claude-api-ingest.md`: Session summary regarding Claude API integration.
* `docs/flint/session-2026-03-13-resolve-build-errors-and-port-conflicts.md`: Session summary detailing the build error resolution process.
```