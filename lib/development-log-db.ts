import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DevelopmentLogPayload,
  DevelopmentLogSession,
  DevelopmentLogSummary,
} from "@/lib/development-log-types";

export type DbDevelopmentLogSession = {
  composer_id: string;
  started_at: string;
  last_updated_at: string | null;
  duration: string | null;
  month: string;
  difficulty: string | null;
  title: string;
  title_en: string | null;
  first_user_prompt: string | null;
  first_user_prompt_en: string | null;
  subtitle: string | null;
  subtitle_en: string | null;
  model: string | null;
  bubbles: number | null;
  files_changed: number | null;
  lines_added: number | null;
  lines_removed: number | null;
  peak_context_tokens: number | null;
  models_with_usage: string | null;
  agentic: boolean | null;
  is_subagent: boolean | null;
  confidence: string | null;
  workspace_path: string | null;
  source_kind: string | null;
  raw_metadata: { topics?: string[] } | null;
  synced_at: string | null;
};

export type DbDevelopmentLogSyncRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  sessions_total: number | null;
  sessions_upserted: number | null;
  sessions_from_transcripts: number | null;
  error_message: string | null;
  host_name: string | null;
  generated_at: string | null;
};

const SESSION_SELECT =
  "composer_id,started_at,last_updated_at,duration,month,difficulty,title,title_en,first_user_prompt,first_user_prompt_en,subtitle,subtitle_en,model,bubbles,files_changed,lines_added,lines_removed,peak_context_tokens,models_with_usage,agentic,is_subagent,confidence,workspace_path,source_kind,raw_metadata,synced_at";

function formatLocalTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function mapDbSession(row: DbDevelopmentLogSession): DevelopmentLogSession {
  return {
    started_at: formatLocalTimestamp(row.started_at),
    last_updated_at: formatLocalTimestamp(row.last_updated_at),
    duration: row.duration ?? "",
    month: row.month,
    difficulty: row.difficulty ?? "",
    title: row.title_en?.trim() || row.title,
    first_user_prompt: row.first_user_prompt_en?.trim() || row.first_user_prompt || "",
    subtitle: row.subtitle_en?.trim() || row.subtitle || "",
    model: row.model ?? "",
    bubbles: row.bubbles ?? 0,
    files_changed: row.files_changed ?? 0,
    lines_added: row.lines_added ?? 0,
    lines_removed: row.lines_removed ?? 0,
    peak_context_tokens: row.peak_context_tokens ?? 0,
    models_with_usage: row.models_with_usage ?? "",
    agentic: row.agentic ?? false,
    is_subagent: row.is_subagent ?? false,
    confidence: row.confidence ?? "",
    composer_id: row.composer_id,
    workspace_path: row.workspace_path ?? "",
    source: row.source_kind ?? undefined,
    topics: row.raw_metadata?.topics ?? undefined,
  };
}

export function buildDevelopmentLogSummary(
  sessions: DevelopmentLogSession[]
): DevelopmentLogSummary {
  const human = sessions.filter((s) => !s.is_subagent);
  const subagent = sessions.filter((s) => s.is_subagent);
  const explicit = sessions.filter((s) => s.confidence === "explicit").length;

  const diffCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalFiles = 0;

  for (const s of human) {
    diffCounts[s.difficulty] = (diffCounts[s.difficulty] ?? 0) + 1;
    if (s.model) modelCounts[s.model] = (modelCounts[s.model] ?? 0) + 1;
    totalLinesAdded += s.lines_added;
    totalLinesRemoved += s.lines_removed;
    totalFiles += s.files_changed;
  }

  const sorted = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at));

  return {
    total_sessions: sessions.length,
    human_sessions: human.length,
    subagent_sessions: subagent.length,
    explicit_workspace_tag: explicit,
    inferred_workspace_tag: sessions.length - explicit,
    time_range_start: sorted[0]?.started_at ?? "",
    time_range_end: sorted[sorted.length - 1]?.started_at ?? "",
    human_files_changed: totalFiles,
    human_lines_added: totalLinesAdded,
    human_lines_removed: totalLinesRemoved,
    difficulty_counts: diffCounts,
    model_counts: modelCounts,
  };
}

export type DevelopmentLogDbResult = {
  payload: DevelopmentLogPayload;
  syncRun: DbDevelopmentLogSyncRun | null;
  source: "db";
};

export async function fetchDevelopmentLogFromDb(
  supabase: SupabaseClient
): Promise<DevelopmentLogDbResult | null> {
  const [sessionsRes, syncRes] = await Promise.all([
    supabase
      .from("development_log_sessions")
      .select(SESSION_SELECT)
      .order("started_at", { ascending: false })
      .limit(5000),
    supabase
      .from("development_log_sync_runs")
      .select(
        "id,started_at,finished_at,status,sessions_total,sessions_upserted,sessions_from_transcripts,error_message,host_name,generated_at"
      )
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sessionsRes.error) {
    throw new Error(sessionsRes.error.message);
  }

  const rows = (sessionsRes.data ?? []) as DbDevelopmentLogSession[];
  if (rows.length === 0) {
    return null;
  }

  const sessions = rows.map(mapDbSession).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const generatedAt =
    syncRes.data?.generated_at ??
    syncRes.data?.finished_at ??
    rows[0]?.synced_at ??
    new Date().toISOString();

  return {
    source: "db",
    syncRun: (syncRes.data as DbDevelopmentLogSyncRun | null) ?? null,
    payload: {
      generated_at: generatedAt,
      summary: buildDevelopmentLogSummary(sessions),
      sessions,
    },
  };
}
