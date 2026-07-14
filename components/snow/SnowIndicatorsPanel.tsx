import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  CloudSnow,
  Globe2,
  HelpCircle,
  Info,
  Minus,
  Wind,
} from "lucide-react";
import type {
  ConfidenceLevel,
  HistoricalRelevance,
  IndicatorStatus,
  RegionalSnowIndicatorPanel,
  SignalStageStatus,
  SnowIndicator,
  SnowSignalStage,
  StageId,
} from "@/lib/snow/snow-indicators";

// Snow Indicators panel — reference-only. Three lead-time stages shown by
// default; each expands (native <details>) to its indicators. Status is carried
// by icon + text + colour together (never colour alone), calm palette. No
// amounts, no probabilities. See lib/snow/snow-indicators.ts for the contract.

type Tone = "good" | "partial" | "neutral" | "unclear" | "bad" | "none";

const TONE: Record<Tone, { cls: string; Icon: ComponentType<{ className?: string }> }> = {
  good: { cls: "text-sky-300 bg-sky-500/15 border-sky-500/30", Icon: Check },
  partial: { cls: "text-teal-300 bg-teal-500/12 border-teal-500/30", Icon: ArrowUpRight },
  neutral: { cls: "text-slate-300 bg-slate-600/30 border-slate-500/40", Icon: Minus },
  unclear: {
    cls: "text-purple-300 bg-purple-500/15 border-purple-400/40 border-dashed",
    Icon: AlertTriangle,
  },
  bad: { cls: "text-amber-300 bg-amber-500/15 border-amber-500/30", Icon: ArrowDown },
  none: { cls: "text-slate-500 bg-slate-700/30 border-slate-600/40", Icon: Minus },
};

const STAGE_STATUS: Record<SignalStageStatus, { label: string; tone: Tone }> = {
  favourable: { label: "Favourable", tone: "good" },
  detected: { label: "Detected", tone: "good" },
  active: { label: "Active", tone: "good" },
  emerging: { label: "Emerging", tone: "partial" },
  possible: { label: "Possible", tone: "partial" },
  neutral: { label: "Neutral", tone: "neutral" },
  weak: { label: "Weak", tone: "neutral" },
  incomplete: { label: "Incomplete", tone: "partial" },
  mixed: { label: "Mixed", tone: "unclear" },
  conflicting: { label: "Conflicting", tone: "unclear" },
  unclear: { label: "Unclear", tone: "unclear" },
  unfavourable: { label: "Unfavourable", tone: "bad" },
  not_detected: { label: "Not detected", tone: "none" },
};

const CONTRIBUTION: Record<IndicatorStatus, { label: string; tone: Tone }> = {
  favourable: { label: "Favourable", tone: "good" },
  slightly_favourable: { label: "Slightly favourable", tone: "partial" },
  neutral: { label: "Neutral", tone: "neutral" },
  slightly_unfavourable: { label: "Slightly unfavourable", tone: "bad" },
  unfavourable: { label: "Unfavourable", tone: "bad" },
  unknown: { label: "Unknown", tone: "none" },
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  insufficient_data: "Insufficient data",
};

const RELEVANCE_LABEL: Record<HistoricalRelevance, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  unstable: "Unstable",
  insufficient_data: "Insufficient data",
};

const STAGE_ICON: Record<StageId, ComponentType<{ className?: string }>> = {
  seasonal: Globe2,
  developing: Wind,
  snow_setup: CloudSnow,
};

function StatusChip({ status }: { status: SignalStageStatus }) {
  const { label, tone } = STAGE_STATUS[status];
  const { cls, Icon } = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function ContributionChip({ status }: { status: IndicatorStatus }) {
  const { label, tone } = CONTRIBUTION[status];
  const { cls, Icon } = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function IndicatorCard({ ind }: { ind: SnowIndicator }) {
  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{ind.label}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {ind.currentValue ?? ind.currentCondition}
          </p>
        </div>
        <ContributionChip status={ind.snowContribution} />
      </div>
      <p className="text-xs text-slate-500 mt-1.5">{ind.description}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
        <span>
          Confidence:{" "}
          <span className="text-slate-300 font-medium">{CONFIDENCE_LABEL[ind.confidence]}</span>
        </span>
        <span>
          Historical relevance:{" "}
          <span className="text-slate-300 font-medium">
            {RELEVANCE_LABEL[ind.historicalRelevance]}
          </span>
        </span>
        {ind.stale && (
          <span className="inline-flex items-center gap-1 text-amber-400/80">
            <AlertTriangle className="w-3 h-3" /> stale ({ind.updatedAt})
          </span>
        )}
      </div>
    </div>
  );
}

// Traffic-light colour per snow contribution (green = favourable → red =
// unfavourable, grey = no data). Used only for the at-a-glance dots; the
// detailed stages keep icon + text for colour-blind readers.
const LIGHT: Record<IndicatorStatus, string> = {
  favourable: "#22c55e",
  slightly_favourable: "#86efac",
  neutral: "#f59e0b",
  slightly_unfavourable: "#fb923c",
  unfavourable: "#ef4444",
  unknown: "#64748b",
};

// At-a-glance overview: a small traffic light per indicator, grouped by stage,
// so the picture reads without expanding each stage.
function AtAGlance({ stages }: { stages: SnowSignalStage[] }) {
  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">Indicators at a glance</p>
      {stages.map((stage) => (
        <div key={stage.id} className="flex items-start gap-2">
          <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-slate-500 pt-0.5">
            {stage.title.replace(" Background", "").replace(" Pattern", "")}
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 min-w-0">
            {stage.indicators.map((ind) => (
              <span
                key={ind.id}
                className="inline-flex items-center gap-1.5 text-[11px] text-slate-300"
                title={`${ind.label} — ${CONTRIBUTION[ind.snowContribution].label}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: LIGHT[ind.snowContribution] }}
                />
                {ind.label}
              </span>
            ))}
          </span>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[10px] text-slate-500">
        {(
          [
            ["#22c55e", "favourable"],
            ["#f59e0b", "neutral"],
            ["#ef4444", "unfavourable"],
            ["#64748b", "no data"],
          ] as const
        ).map(([c, lbl]) => (
          <span key={lbl} className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
            {lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

function StageRow({ stage }: { stage: SnowSignalStage }) {
  const Icon = STAGE_ICON[stage.id];
  return (
    <details className="rounded-xl bg-slate-800/30 border border-slate-700/50 group/stage">
      <summary className="cursor-pointer list-none p-3 flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <span className="text-sm font-medium text-white">{stage.title}</span>
            <StatusChip status={stage.status} />
            <span className="text-[11px] text-slate-500">
              {CONFIDENCE_LABEL[stage.confidence]} confidence
            </span>
          </span>
          <span className="block text-xs text-slate-400 mt-1">
            {stage.leadTimeLabel} · {stage.summary}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 mt-0.5 transition-transform group-open/stage:rotate-180" />
      </summary>
      <div className="px-3 pb-3 space-y-2">
        {stage.indicators.map((ind) => (
          <IndicatorCard key={ind.id} ind={ind} />
        ))}
        <p className="text-[11px] text-slate-600 flex items-start gap-1.5 pt-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="text-slate-500">Confidence</span> = how sure the models/data are
            right now; <span className="text-slate-500">Historical relevance</span> = how stable
            this indicator&apos;s past link to snowfall has been. They are different things.
          </span>
        </p>
      </div>
    </details>
  );
}

export function SnowIndicatorsPanel({ panel }: { panel: RegionalSnowIndicatorPanel }) {
  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white">Snow Indicators</h3>
          {panel.isDemo && (
            <span className="text-[10px] font-semibold tracking-wide uppercase text-purple-300 bg-purple-500/15 border border-purple-400/40 rounded px-1.5 py-0.5">
              Demo
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Reference indicators showing whether snow-favourable conditions are being detected — not
          a snowfall amount or a chance-of-snow number.
        </p>
      </div>

      <AtAGlance stages={panel.stages} />

      <div className="space-y-2">
        {panel.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Summary</p>
        <p className="text-sm text-slate-200">{panel.overallSummary}</p>
      </div>

      <p className="text-[11px] text-slate-600 border-t border-slate-700/50 pt-3">
        {panel.disclaimer} Updated {panel.updatedAt}.
        {panel.isDemo && " Demo data — indicator values are placeholders, not live meteorology."}
      </p>
    </div>
  );
}
