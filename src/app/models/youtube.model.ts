/**
 * youtube.model.ts — TypeScript mirrors of the Python YoutubeBrief schemas.
 * Matches langchain-agents/agents/youtube_agent/schemas/types.py
 */

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

export interface YoutubeAnalysisResult {
  video_id: string;
  brief: YoutubeBrief;
  haiku: string;
  haiku_id?: string;
  proposed_tasks: ProposedTask[];
}

export interface QueueTasksResult {
  queued_count: number;
  task_ids: string[];
  error_count: number;
  errors: string[];
}
