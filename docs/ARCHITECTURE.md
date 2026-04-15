# Architecture Snapshot

## Frontend

- Stack: Ionic 8 + Angular 20, standalone components
- Routing: `/dashboard`, `/task/:id`, `/new-thread`, `/chat`
- State: Angular signals + computed in feature pages
- Services: `TaskService`, `SocketService`, `ThreadService`, `ApprovalService`, `ChatService`
- Dev server: port **18320**, binds `0.0.0.0` (LAN-accessible at `192.168.4.93:18320`)
- Proxy: `/api` and `/socket.io` forwarded to `127.0.0.1:18310`

## Backend

- Node + Express + Socket.io at port **18310** (127.0.0.1 only, accessed via Angular proxy)
- Sole data layer: `backend/src/services/flintMcp.ts` — all calls go through Flint MCP via SSE
- No direct SQLite access

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tasks` | List agent tasks |
| GET | `/api/tasks/:id` | Task detail |
| PATCH | `/api/tasks/:id` | Update task |
| POST | `/api/tasks/:id/process` | Trigger Flint processing |
| POST | `/api/tasks/:id/chat` | Add session_task under parent |
| POST | `/api/tasks/:id/plan` | Sonnet plans task → auto-creates child tasks |
| GET | `/api/approvals` | List pending approvals |
| POST | `/api/approvals/:id/approve` | Approve |
| POST | `/api/approvals/:id/reject` | Reject |
| GET | `/api/threads` | List threads |
| POST | `/api/threads` | Create thread |
| POST | `/api/chat` | Global chat via `route_and_query` |
| GET | `/api/health` | Health check |

### WebSocket events
- `task:update` — live task status push (implemented)
- `task:log` — streaming tool call output (phase 3, planned)

## Flint MCP

- Port 18765 (core), 18766 (tax), 18767 (repo)
- Backend communicates via JSON-RPC/SSE
- `callTool(name, args)` in `flintMcp.ts` is the sole bridge

## process management

```
flint dashboard start|stop|restart|status|logs
flint dashboard backend start|stop|restart|status|logs
flint dashboard ionic start|stop|restart|status|logs
```

## Triage Runbook

**First move is always process liveness — never read source code first.**

### Step 1 — Check all three processes

```bash
lsof -ti :18310 && echo "backend OK" || echo "BACKEND DOWN"
lsof -ti :18320 && echo "angular OK" || echo "ANGULAR DOWN"
lsof -ti :18765 && echo "flint OK"   || echo "FLINT DOWN"
```

Or use `flint list` for a unified view including PIDs and health.

### Step 2 — If processes are up but UI shows nothing

```bash
curl -s "http://localhost:18310/api/tasks?limit=2" | python3 -m json.tool | head -15
curl -s "http://localhost:18310/api/health"
```

If `/api/tasks` returns data but Angular shows nothing → check browser console for CORS/proxy errors (`proxy.conf.json` routes `/api` → `:18310`).

### Step 3 — Restart order

Always restart in dependency order: Flint → backend → Angular

```bash
flint restart                         # if Flint is down
flint dashboard backend restart       # if backend is down
flint dashboard ionic restart         # if Angular dev server is down
```

### Port collision (EADDRINUSE)

```bash
lsof -ti :PORT | xargs kill -9 2>/dev/null
```

The `npm run dev` backend script auto-kills its port. For Angular use the line above.

### Common failure patterns

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| UI blank, no console errors | Angular down | `flint dashboard ionic restart` |
| API 502 in console | Backend down | `flint dashboard backend restart` |
| API 503 / MCP errors | Flint down | `flint restart` |
| Tasks load but stale | Flint DB locked | `flint restart`; check `~/.flint/tasks.db` not open elsewhere |
| WebSocket not connecting | Backend port conflict | kill `:18310`, restart backend |
