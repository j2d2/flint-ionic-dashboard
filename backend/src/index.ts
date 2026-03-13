/**
 * index.ts — Express + Socket.io backend for Flint Dashboard.
 *
 * Architecture:
 *   Angular (4200) ←HTTP+WS→ Express (3001) ←JSON-RPC→ Flint MCP (18765)
 *
 * All task data flows through flintMcp.ts. No direct SQLite access in this process.
 * See: Decisions/2026-03-12-dashboard-flint-interface-decision.md
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';

import { tasksRouter } from './routes/tasks';
import { approvalsRouter } from './routes/approvals';
import { threadsRouter } from './routes/threads';
import { chatRouter } from './routes/chat';
import { systemRouter } from './routes/system';
import { startTailing, threadEvents } from './services/toolCallTailer';
import * as flint from './services/flintMcp';
import { AgentTask } from './types/AgentTask';

const PORT = parseInt(process.env.PORT ?? '18310', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:4200,capacitor://localhost')
  .split(',')
  .map(o => o.trim());

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const io = new SocketIoServer(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'] },
});

// Forward toolCallTailer events to all connected WS clients
threadEvents.on('thread:event', (evt) => {
  io.emit('thread:event', evt);
});

io.on('connection', (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[socket.io] client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/tasks', tasksRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/threads', threadsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/system', systemRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    flint_mcp_url: process.env.FLINT_MCP_URL ?? 'http://127.0.0.1:18765/mcp',
    local_only: process.env.LOCAL_ONLY === 'true',
    disable_escalation: process.env.DISABLE_ESCALATION === 'true',
    vault_path: process.env.VAULT_PATH ?? '(not set)',
    ts: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Polling loop — emit Socket.io events on task/approval changes
// ---------------------------------------------------------------------------
let _lastTaskSnapshot = new Map<string, string>(); // id → status
let _lastApprovalIds = new Set<string>();

async function pollFlint(): Promise<void> {
  try {
    // Task status change detection
    const tasks = await flint.listTasks(undefined, 100);
    for (const task of tasks) {
      const prev = _lastTaskSnapshot.get(task.id);
      if (prev !== task.status) {
        io.emit('task:update', task);
        _lastTaskSnapshot.set(task.id, task.status);
      }
    }
    // Prune removed tasks from snapshot map
    const currentIds = new Set(tasks.map((t: AgentTask) => t.id));
    for (const id of _lastTaskSnapshot.keys()) {
      if (!currentIds.has(id)) _lastTaskSnapshot.delete(id);
    }
  } catch (err) {
    console.warn('[poll] task list failed:', (err as Error).message);
  }

  // Approval queue change detection (every 10s handled by multiplier in caller)
}

let _pollCount = 0;
async function pollLoop(): Promise<void> {
  _pollCount++;

  await pollFlint();

  // Approval poll every 10s (2× the 5s task poll)
  if (_pollCount % 2 === 0) {
    try {
      const items = await flint.getApprovals();
      const incoming = new Set(items.map((i) => (i as unknown as Record<string, string>).id ?? (i as unknown as Record<string, string>).task_id));
      const newItems = items.filter(i => !_lastApprovalIds.has((i as unknown as Record<string, string>).id ?? (i as unknown as Record<string, string>).task_id));
      if (newItems.length > 0) {
        io.emit('approval:update', { items: newItems, total: items.length });
      }
      _lastApprovalIds = incoming;
    } catch (err) {
      console.warn('[poll] approval list failed:', (err as Error).message);
    }
  }

  setTimeout(pollLoop, 5_000);
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[flint-backend] listening on http://127.0.0.1:${PORT}`);
  console.log(`[flint-backend] Flint MCP → ${process.env.FLINT_MCP_URL ?? 'http://127.0.0.1:18765/mcp'}`);
  console.log(`[flint-backend] VAULT_PATH → ${process.env.VAULT_PATH ?? '(not set)'}`);
  startTailing();
  setTimeout(pollLoop, 2_000); // start polling after 2s warmup
});
