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
