# Proposed Flint Agent Tasks (Pending Approval)

These are proposals only. Queue as `agent_task` after approval.

1. Flint Dev Starter Tool
- Goal: one command to scaffold app + backend + docs skeleton for Angular/Ionic repos.
- Why: reduces repeated project bootstrap steps and improves consistency.

2. MCP Session Diagnostics Tool
- Goal: report what tools are server-available vs host-visible in current client session.
- Why: removes ambiguity when tools are healthy server-side but hidden client-side.

3. Framework-Aware Repo Bootstrap
- Goal: detect Angular repo and auto-suggest/add official Angular CLI MCP server config in `.vscode/mcp.json`.
- Why: keeps Angular-specific tooling official and repo-local.

4. Task API Input Normalization
- Goal: accept aliases (`agent_type`/`task_type`, tag arrays) in task tools with coercion.
- Why: reduces invocation errors from host-side tool callers.
