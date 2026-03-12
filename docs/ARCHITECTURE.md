# Architecture Snapshot

## Frontend

- Stack: Ionic 8 + Angular 20
- Routing: `/dashboard`, `/task/:id`, `/new-thread`
- Local state: Angular signals in feature pages
- Data stubs: `TaskService`, `SocketService`, `ThreadService`

## Backend (planned)

- Node + Express + Socket.io
- Endpoints:
  - `GET /api/tasks`
  - `GET /api/tasks/:id`
  - `POST /api/tasks/:id/thread`
- WS events:
  - `task:update`
  - `task:log` (phase 3)

## Integration Path

1. Replace `TaskService` mock with HTTP client
2. Add singleton socket client and live update merge logic
3. Route thread creation to backend endpoint
4. Swap mock task store with OpenClaw source adapter
