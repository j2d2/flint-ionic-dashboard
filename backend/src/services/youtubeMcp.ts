/**
 * youtubeMcp.ts — service layer for flint-youtube MCP server.
 *
 * flint-youtube runs on port 18769 (separate from flint-core on 18765).
 * Start it with: flint youtube start
 *
 * Uses the same streamable-http transport pattern as flintMcp.ts.
 */

const YOUTUBE_MCP_URL =
  process.env.FLINT_YOUTUBE_MCP_URL ?? 'http://127.0.0.1:18769/mcp';

async function callYoutubeTool(name: string, args: object): Promise<unknown> {
  const res = await fetch(YOUTUBE_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`flint-youtube MCP HTTP ${res.status}: ${await res.text()}`);
  }

  // Streamable-http returns SSE — parse `data:` lines
  const raw = await res.text();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const blob = JSON.parse(trimmed.slice(5)) as {
        result?: {
          content?: Array<{ type: string; text: string }>;
          isError?: boolean;
        };
        error?: { message: string };
      };

      // JSON-RPC level error
      if (blob.error) throw new Error(blob.error.message);

      const content = blob.result?.content;
      const text = content?.[0]?.text;

      // FastMCP sets isError:true when a tool raises an exception.
      // The content[0].text is then a plain error string, not JSON.
      if (blob.result?.isError) {
        throw new Error(text ?? 'flint-youtube tool error (no message)');
      }

      if (content?.[0]?.type === 'text' && text !== undefined) {
        // Safe parse — guard against unexpected plain-text responses
        try {
          return JSON.parse(text);
        } catch {
          // Not JSON — likely an error string; surface it clearly
          throw new Error(text);
        }
      }
      return blob.result;
    }
  }
  throw new Error('No data in flint-youtube MCP response');
}

// ---------------------------------------------------------------------------
// Typed interfaces — mirrors schemas/types.py in langchain-agents
// ---------------------------------------------------------------------------

export interface VideoMetadata {
  video_id: string;
  title: string;
  channel: string;
  upload_date: string;
  duration_seconds: number;
  description: string;
  tags: string[];
  view_count?: number;
  chapters: Array<{ start_time: number; title: string; end_time?: number }>;
  webpage_url: string;
}

export interface CredibilitySignals {
  has_citations: boolean;
  expert_claims: string[];
  red_flags: string[];
}

export interface References {
  urls: string[];
  books: string[];
  people: string[];
  tools_and_products: string[];
  concepts: string[];
}

export interface ChapterSummary {
  timestamp: string;
  title: string;
  summary: string;
}

export interface ProposedTask {
  id?: string;
  title: string;
  type: string;
  description: string;
  priority: 1 | 2 | 3;
  source_quote: string;
  estimated_effort: 'quick' | 'deep';
  status: string;
}

export interface YoutubeBrief {
  video_id: string;
  title: string;
  channel: string;
  published: string;
  duration_seconds: number;
  tldr: string;
  key_takeaways: string[];
  references: References;
  chapters: ChapterSummary[];
  credibility_signals: CredibilitySignals;
  proposed_tasks: ProposedTask[];
}

// ---------------------------------------------------------------------------
// Tool wrappers
// ---------------------------------------------------------------------------

export async function buildBrief(
  videoId: string,
  lang = 'en',
): Promise<YoutubeBrief> {
  return (await callYoutubeTool('build_brief', {
    video_id: videoId,
    lang,
  })) as YoutubeBrief;
}

export async function proposeTasks(
  brief: YoutubeBrief,
): Promise<ProposedTask[]> {
  const result = await callYoutubeTool('propose_tasks', { brief });
  return Array.isArray(result) ? (result as ProposedTask[]) : [];
}
