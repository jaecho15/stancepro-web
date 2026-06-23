export type DevelopmentLogSummary = {
  total_sessions: number;
  human_sessions: number;
  subagent_sessions: number;
  explicit_workspace_tag: number;
  inferred_workspace_tag: number;
  time_range_start: string;
  time_range_end: string;
  human_files_changed: number;
  human_lines_added: number;
  human_lines_removed: number;
  difficulty_counts: Record<string, number>;
  model_counts: Record<string, number>;
};

export type DevelopmentLogSession = {
  started_at: string;
  last_updated_at: string;
  duration: string;
  month: string;
  difficulty: string;
  title: string;
  first_user_prompt: string;
  subtitle: string;
  model: string;
  bubbles: number;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  peak_context_tokens: number;
  models_with_usage: string;
  agentic: boolean;
  is_subagent: boolean;
  confidence: string;
  composer_id: string;
  workspace_path: string;
};

export type DevelopmentLogPayload = {
  generated_at: string;
  summary: DevelopmentLogSummary;
  sessions: DevelopmentLogSession[];
};

export const PROMPT_LOG_PUBLIC_PATH = "/internal/prompt_log.json";
export const FOUNDER_JOURNAL_PUBLIC_PATH = "/internal/founder_development_journal.json";
export const TIMELINE_2025_PUBLIC_PATH = "/internal/development_timeline_2025.json";

export type TimelineEvidenceEntry = {
  date: string;
  month: string;
  source: "git" | "documentation" | "supabase migration" | string;
  confidence: string;
  areas: string[];
  title: string;
  evidence: string;
  detail?: string;
};

export type Timeline2025MonthlySummary = {
  month: string;
  founder_entries: number;
  evidence_rows: number;
  git_commits: number;
  documentation_rows: number;
  migration_rows: number;
};

export type Timeline2025Payload = {
  generated_at: string;
  source: string;
  time_range_start: string;
  time_range_end: string;
  summary: {
    founder_entries: number;
    evidence_rows: number;
    git_commits: number;
    documentation_rows: number;
    migration_rows: number;
    months_covered: number;
  };
  monthly: Timeline2025MonthlySummary[];
  evidence: TimelineEvidenceEntry[];
};

export type FounderJournalEntry = {
  date: string;
  time?: string;
  title: string;
  body: string;
  tags: string[];
};

export type FounderJournalPayload = {
  source: string;
  time_range_start: string;
  time_range_end: string;
  entries: FounderJournalEntry[];
  open_todos: string[];
  technical_notes: { topic: string; body: string }[];
};
