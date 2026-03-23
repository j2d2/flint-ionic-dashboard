/**
 * routes/thread-ingest.ts — Parse and ingest a ChatGPT/LLM conversation thread.
 *
 * POST /api/thread-ingest
 *   Body: { raw_text: string, title?: string, mode?: 'linear' | 'branched' }
 *   Returns: { vault_note, tasks_created, turns, task_ids }
 *
 * Parsing handles:
 *   - ChatGPT export format ("You:\n...\nChatGPT:\n...")
 *   - Generic markdown blockquotes (> User: / > Assistant:)
 *   - H2/H3 headings used as branch separators
 *   - Raw alternating paragraphs (best-effort)
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';

export const threadIngestRouter = Router();

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  turn_index: number;
  branch_label?: string;
}

export interface IngestResult {
  turns: Turn[];
  task_ids: string[];
  vault_note: string;
  title: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Thread parser
// ---------------------------------------------------------------------------

const USER_PATTERNS   = /^(you|user|human|me|prompt)[\s]*[:\-]?\s*/i;
const ASSIST_PATTERNS = /^(chatgpt|gpt|assistant|claude|ai|response|copilot)[\s]*[:\-]?\s*/i;
const BRANCH_HEADING  = /^#{1,3}\s+(.+)/;

function parseThread(raw: string): Turn[] {
  const turns: Turn[] = [];
  const lines = raw.split('\n');

  let currentRole: 'user' | 'assistant' | null = null;
  let currentLines: string[] = [];
  let turnIndex = 0;
  let branchLabel: string | undefined;

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content && currentRole) {
      turns.push({ role: currentRole, content, turn_index: turnIndex++, branch_label: branchLabel });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const stripped = line.trim();

    // Branch heading — marks a new conversation branch
    const branchMatch = stripped.match(BRANCH_HEADING);
    if (branchMatch) {
      flush();
      branchLabel = branchMatch[1].trim();
      currentRole = null;
      continue;
    }

    // User speaker label
    if (USER_PATTERNS.test(stripped)) {
      flush();
      currentRole = 'user';
      const rest = stripped.replace(USER_PATTERNS, '').trim();
      if (rest) currentLines.push(rest);
      continue;
    }

    // Assistant speaker label
    if (ASSIST_PATTERNS.test(stripped)) {
      flush();
      currentRole = 'assistant';
      const rest = stripped.replace(ASSIST_PATTERNS, '').trim();
      if (rest) currentLines.push(rest);
      continue;
    }

    // Blockquote pattern (> User: ...)
    if (stripped.startsWith('> ')) {
      const inner = stripped.slice(2).trim();
      if (USER_PATTERNS.test(inner)) {
        flush();
        currentRole = 'user';
        const rest = inner.replace(USER_PATTERNS, '').trim();
        if (rest) currentLines.push(rest);
        continue;
      }
      if (ASSIST_PATTERNS.test(inner)) {
        flush();
        currentRole = 'assistant';
        const rest = inner.replace(ASSIST_PATTERNS, '').trim();
        if (rest) currentLines.push(rest);
        continue;
      }
    }

    // Separator lines — double blank line flips speaker role (best-effort for raw pastes)
    if (!stripped && currentLines.length && currentLines[currentLines.length - 1] === '') {
      flush();
      // Infer next role from alternation
      currentRole = currentRole === 'user' ? 'assistant' : currentRole === 'assistant' ? 'user' : null;
      continue;
    }

    if (currentRole) currentLines.push(stripped || '');
  }

  flush();
  return turns.filter(t => t.content.length > 0);
}

// ---------------------------------------------------------------------------
// Task extraction — each user prompt turn + its response becomes a potential task
// ---------------------------------------------------------------------------

function extractKeyTurns(turns: Turn[]): { prompt: string; response: string; branch?: string }[] {
  const pairs: { prompt: string; response: string; branch?: string }[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role === 'user') {
      const next = turns[i + 1];
      if (next?.role === 'assistant') {
        pairs.push({
          prompt: turns[i].content,
          response: next.content,
          branch: turns[i].branch_label,
        });
        i++; // skip the assistant turn we've paired
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Vault note builder
// ---------------------------------------------------------------------------

function buildVaultNote(
  title: string,
  turns: Turn[],
  taskIds: string[],
  ingestedAt: string,
): string {
  const header = `---
title: "${title}"
type: thread-ingest
tags: [thread, import, chatgpt]
ingested_at: ${ingestedAt}
task_count: ${taskIds.length}
---

# ${title}

_Ingested from ChatGPT thread — ${ingestedAt}_

`;

  const threadBody = turns.map(t => {
    const label = t.role === 'user' ? '**You**' : '**Assistant**';
    const branch = t.branch_label ? `\n> _Branch: ${t.branch_label}_\n` : '';
    return `${branch}### ${label}\n\n${t.content}`;
  }).join('\n\n---\n\n');

  const taskSection = taskIds.length
    ? `\n\n## Agent Tasks Created\n\n${taskIds.map(id => `- task:${id}`).join('\n')}`
    : '';

  return header + threadBody + taskSection;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

threadIngestRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { raw_text, title, create_tasks = true } = req.body as {
      raw_text: string;
      title?: string;
      create_tasks?: boolean;
    };

    if (!raw_text?.trim()) {
      res.status(400).json({ error: 'raw_text is required' });
      return;
    }

    const turns = parseThread(raw_text.trim());
    if (turns.length === 0) {
      res.status(422).json({ error: 'Could not parse any conversation turns from the provided text. Make sure speaker labels (You: / ChatGPT:) are present.' });
      return;
    }

    const ingestedAt = new Date().toISOString().split('T')[0];
    const autoTitle = title?.trim() || `Thread Ingest ${ingestedAt}`;

    // Extract user prompt → response pairs as candidate tasks
    const pairs = extractKeyTurns(turns);
    const taskIds: string[] = [];

    if (create_tasks && pairs.length > 0) {
      // Create one task per user prompt (first prompt = main task, rest = sub-context)
      // Cap at 5 tasks to avoid flooding the queue
      const toCreate = pairs.slice(0, 5);
      for (const pair of toCreate) {
        const shortTitle = pair.prompt.split('\n')[0].trim().slice(0, 120);
        const branchPrefix = pair.branch ? `[${pair.branch}] ` : '';
        try {
          const result = await flint.createTask({
            title: `${branchPrefix}${shortTitle}`,
            description: `**Original prompt:**\n\n${pair.prompt}\n\n---\n\n**Thread context:**\n\n${pair.response.slice(0, 800)}`,
            task_type: 'standard',
            tags: 'channel:inbox,source:thread-ingest',
          });
          taskIds.push(result.task_id);
        } catch {
          // Non-fatal — continue creating remaining tasks
        }
      }
    }

    // Write vault note
    const vaultContent = buildVaultNote(autoTitle, turns, taskIds, ingestedAt);
    const vaultFileName = `${autoTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.md`;

    let vaultNote = '';
    try {
      const vaultResult = await flint.addToVault(vaultFileName, vaultContent, 'Threads');
      vaultNote = (vaultResult as { path?: string })?.path ?? vaultFileName;
    } catch {
      // Non-fatal — return result even if vault write fails
      vaultNote = `Threads/${vaultFileName}`;
    }

    const summary = `Parsed ${turns.length} turns, created ${taskIds.length} tasks, saved to vault.`;

    res.json({
      turns,
      task_ids: taskIds,
      vault_note: vaultNote,
      title: autoTitle,
      summary,
    } satisfies IngestResult);
  } catch (err) {
    console.error('[thread-ingest]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thread-ingest/create-task
// Creates a single parent agent task summarizing an ingested thread.
// ---------------------------------------------------------------------------
threadIngestRouter.post('/create-task', async (req: Request, res: Response) => {
  try {
    const { title, summary, vault_note, turn_count } = req.body as {
      title?: string;
      summary?: string;
      vault_note?: string;
      turn_count?: number;
    };

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const description = [
      summary ?? '',
      vault_note ? `\nVault note: ${vault_note}` : '',
      turn_count != null ? `\nThread turns: ${turn_count}` : '',
    ].filter(Boolean).join('\n').trim();

    const result = await flint.createTask({
      title: title.slice(0, 120),
      description,
      task_type: 'standard',
      tags: 'source:thread-ingest',
    });

    res.json({ task_id: result.task_id });
  } catch (err) {
    console.error('[thread-ingest/create-task]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
