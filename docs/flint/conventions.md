---
title: flint-ionic-dashboard — Conventions Reference
date: 2026-05-20
type: conventions
authoritative: true
---

# flint-ionic-dashboard — Conventions Reference

> Authoritative conventions for this repo. Referenced by MEMORY.md generation.
> Update this file when conventions change.

## Port Policy

**Never use default ports (4200, 8100, 3000, etc.).** All ports in the 183xx range.

| Service | Port |
|---------|------|
| Angular frontend | **18320** |
| Express backend | **18310** |

Enforced in both `angular.json` and `package.json` (not just CLI flags).

## App Triage ("UI shows nothing")

Check process liveness first — before reading any source file:

```bash
lsof -ti :18310 && echo "backend OK" || echo "BACKEND DOWN"
lsof -ti :18320 && echo "angular OK" || echo "ANGULAR DOWN"
lsof -ti :18765 && echo "flint OK"   || echo "FLINT DOWN"
```

## Angular Template Rules

- `ChangeDetectionStrategy.OnPush` on all components
- `inject()` for DI (not constructor injection)
- `@if / @for / @switch` control flow only — never `*ngIf` / `*ngFor`
- Always include `track` expression on `@for` (use stable key, not `$index`)

## Backend Rules

- All Flint access goes through `backend/src/services/flintMcp.ts` — never raw SQLite or direct HTTP
- `GET /api/threads` is RESERVED for SSE event-streaming — do NOT overwrite
- `add_to_vault` overwrites (no append) — read → modify → write full note for turn-by-turn appending
- Use `callTool()` only via typed helpers in `flintMcp.ts` — never call `callTool()` directly

## Vault Routing

- Thread documents → vault folder `Threads/`
- Filename: `thread-YYYYMMDD-HHMMSS-{4hex}.md`
