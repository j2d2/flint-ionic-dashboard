/**
 * toolCallTailer.ts — tail ~/.openclaw/flint_tool_calls.jsonl for live thread events.
 *
 * Direct file access is intentional: JSONL log is append-only and never mutated
 * by the dashboard. See ADR for the allowed exception list.
 * If `tail_tool_calls(task_id, since)` is added to Flint later, migrate here.
 */
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { ThreadEvent } from '../types/AgentTask';

const LOG_PATH = process.env.FLINT_TOOL_CALLS_LOG
  ?? path.join(process.env.HOME ?? '~', '.openclaw', 'flint_tool_calls.jsonl');

// One global emitter — routes and socket.io subscribe to it
export const threadEvents = new EventEmitter();
threadEvents.setMaxListeners(100);

let _watching = false;
let _lastSize = 0;

/**
 * Start watching the JSONL log. Called once at server startup.
 * Any new lines appended to the file are parsed and emitted as ThreadEvents.
 */
export function startTailing(): void {
  if (_watching) return;

  // Seed position at end of current file so we don't replay history on startup
  try {
    _lastSize = fs.statSync(LOG_PATH).size;
  } catch {
    _lastSize = 0;
  }

  try {
    fs.watch(path.dirname(LOG_PATH), { persistent: false }, (_event, filename) => {
      if (!filename || !filename.includes('flint_tool_calls')) return;
      _readNewLines();
    });
    _watching = true;
    console.log(`[toolCallTailer] Watching ${LOG_PATH}`);
  } catch (err) {
    console.warn(`[toolCallTailer] Could not watch ${LOG_PATH}:`, err);
  }
}

function _readNewLines(): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(LOG_PATH);
  } catch {
    return;
  }

  if (stat.size <= _lastSize) return;

  const fd = fs.openSync(LOG_PATH, 'r');
  const buf = Buffer.alloc(stat.size - _lastSize);
  fs.readSync(fd, buf, 0, buf.length, _lastSize);
  fs.closeSync(fd);
  _lastSize = stat.size;

  const chunk = buf.toString('utf-8');
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      _dispatchEntry(entry);
    } catch {
      // malformed line — skip
    }
  }
}

function _dispatchEntry(entry: Record<string, unknown>): void {
  const taskId = (entry.task_id ?? entry.taskId ?? '') as string;
  const tool = (entry.tool ?? entry.name ?? '') as string;

  if (!taskId && !tool) return;

  // Emit a tool_call event
  if (entry.arguments !== undefined || entry.args !== undefined) {
    const evt: ThreadEvent = {
      type: 'tool_call',
      taskId,
      tool,
      args: (entry.arguments ?? entry.args) as Record<string, unknown>,
      model: entry.model as string | undefined,
      confidence: entry.confidence as number | undefined,
      timestamp: entry.timestamp as string ?? new Date().toISOString(),
    };
    threadEvents.emit('thread:event', evt);
    if (taskId) threadEvents.emit(`thread:event:${taskId}`, evt);
  }

  // Emit result if present
  if (entry.result !== undefined) {
    const evt: ThreadEvent = {
      type: 'tool_result',
      taskId,
      tool,
      result: entry.result as Record<string, unknown>,
      confidence: entry.confidence as number | undefined,
      timestamp: entry.timestamp as string ?? new Date().toISOString(),
    };
    threadEvents.emit('thread:event', evt);
    if (taskId) threadEvents.emit(`thread:event:${taskId}`, evt);
  }

  // Surface improvement tips from confidence < 0.6 calls
  const conf = entry.confidence as number | undefined;
  if (conf !== undefined && conf < 0.6 && tool) {
    const tip: ThreadEvent = {
      type: 'tip',
      taskId,
      tool,
      tip: `Low confidence (${conf.toFixed(2)}) on '${tool}' — consider using a stronger model or adding more context.`,
      timestamp: new Date().toISOString(),
    };
    threadEvents.emit('thread:event', tip);
    if (taskId) threadEvents.emit(`thread:event:${taskId}`, tip);
  }
}
