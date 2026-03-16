/**
 * routes/youtube.ts — YouTube Agent analysis endpoint.
 *
 * POST /api/youtube/analyze   — full pipeline: brief + haiku + swarm tasks
 * POST /api/youtube/queue-tasks — queue approved tasks into Flint task queue
 */
import { Router, Request, Response } from 'express';
import * as youtube from '../services/youtubeMcp';
import * as flint from '../services/flintMcp';
import { ProposedTask } from '../services/youtubeMcp';

export const youtubeRouter = Router();

// ---------------------------------------------------------------------------
// Utility — extract YouTube video ID from a URL or raw ID
// ---------------------------------------------------------------------------
function extractVideoId(input: string): string | null {
  input = input.trim();
  // Already an 11-char video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    // Standard: youtube.com/watch?v=ID
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    // Short: youtu.be/ID
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1, 12);
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    // Shorts / embed: /shorts/ID  or  /embed/ID  or  /v/ID
    const m = url.pathname.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  } catch {
    // Not a valid URL — continue to fallback
  }
  // Last-resort: find first 11-char alphanumeric sequence
  const m = input.match(/[A-Za-z0-9_-]{11}/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// POST /api/youtube/analyze
// ---------------------------------------------------------------------------
youtubeRouter.post('/analyze', async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  const videoId = extractVideoId(url.trim());
  if (!videoId) {
    res.status(400).json({
      error: 'Could not extract a YouTube video ID from the provided URL.',
    });
    return;
  }

  try {
    // 1. Build intelligence brief (transcript + LLM via flint-youtube ~30-60s)
    const brief = await youtube.buildBrief(videoId);

    // 2. Generate haiku + propose tasks in parallel (both are LLM calls)
    const haikuPrompt = [
      'Write a haiku (3 lines, 5-7-5 syllables) capturing the essence of this YouTube video.',
      `Title: ${brief.title ?? 'Unknown'}`,
      brief.tldr ? `Summary: ${brief.tldr}` : '',
      brief.key_takeaways?.length ? `Key insight: ${brief.key_takeaways[0]}` : '',
      '',
      'Output ONLY the three haiku lines — no title, no commentary, no blank lines between them.',
    ]
      .filter(Boolean)
      .join('\n');

    const [haikuResult, proposedTasks] = await Promise.all([
      flint.routeAndQuery(haikuPrompt),
      youtube.proposeTasks(brief),
    ]);

    // Strip Flint footer banner if present
    const haikuText = haikuResult.response
      .replace(/\n\n---\n⚡ Flint local[^\n]*/s, '')
      .trim();

    // 3. Register the haiku (non-fatal if it fails)
    let haikuId: string | undefined;
    try {
      const today = new Date().toISOString().split('T')[0];
      const reg = await flint.registerHaiku(
        haikuText,
        `YouTube/${videoId}`,
        today,
      );
      haikuId = reg.haiku_id;
    } catch (err) {
      console.warn(
        '[youtube/analyze] haiku registration failed:',
        (err as Error).message,
      );
    }

    res.json({
      video_id: videoId,
      brief,
      haiku: haikuText,
      haiku_id: haikuId,
      proposed_tasks: proposedTasks,
    });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error('[youtube/analyze] error:', message);

    // Friendly error when flint-youtube is not running
    if (
      message.includes('18769') ||
      /fetch failed|econnrefused/i.test(message)
    ) {
      res.status(503).json({
        error:
          'flint-youtube server is not running. Start it with: flint youtube start',
      });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/youtube/queue-tasks
// Queue approved proposed tasks into Flint task queue with tag:youtube
// ---------------------------------------------------------------------------
youtubeRouter.post('/queue-tasks', async (req: Request, res: Response) => {
  const {
    tasks,
    video_id,
    video_title,
  } = req.body as {
    tasks?: ProposedTask[];
    video_id?: string;
    video_title?: string;
  };

  if (!Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: 'tasks array is required' });
    return;
  }

  const results: string[] = [];
  const errors: string[] = [];

  for (const task of tasks) {
    try {
      const descParts = [
        task.description,
        task.source_quote
          ? `\nContext: "${task.source_quote}"`
          : '',
        video_title && video_id
          ? `\nSource: YouTube — "${video_title}" (${video_id})`
          : video_id
            ? `\nSource: YouTube video ${video_id}`
            : '',
      ]
        .filter(Boolean)
        .join('');

      const r = await flint.createTask({
        title: task.title,
        description: descParts.trim(),
        priority: task.priority ?? 2,
        task_type: task.type ?? 'research',
        tags: video_id ? `youtube,${video_id}` : 'youtube',
        review_due: false,
      });
      results.push(r.task_id);
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  res.json({
    queued_count: results.length,
    task_ids: results,
    error_count: errors.length,
    errors,
  });
});
