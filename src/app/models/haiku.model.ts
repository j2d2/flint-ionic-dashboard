/** A single haiku entry from the leaderboard. */
export interface HaikuEntry {
  id: string;
  /** Full 3-line haiku text, newline-separated. */
  haiku_text: string;
  /** Vault-relative path of the session doc that produced this haiku, e.g. Sessions/2026-03-13-slug.md */
  source_doc?: string;
  /** ISO date string (YYYY-MM-DD) of the session. */
  session_date?: string;
  /** Total vote count. */
  vote_count: number;
  /** Unix epoch (seconds) of insertion. */
  created_at: number;
}

export interface HaikuListResponse {
  haikus: HaikuEntry[];
  total: number;
}

export interface HaikuPairResponse {
  a: HaikuEntry;
  b: HaikuEntry;
}

export interface HaikuNoPairsResponse {
  status: 'no_more_pairs';
}

export type HaikuPairResult = HaikuPairResponse | HaikuNoPairsResponse;

/** Returns the 3 lines of a haiku as an array, padding to 3 if needed. */
export function splitHaikuLines(haiku_text: string): [string, string, string] {
  const lines = haiku_text.split('\n').map((l) => l.trim()).filter(Boolean);
  return [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
}
