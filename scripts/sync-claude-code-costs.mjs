#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co";
const DEFAULT_SOURCE = "anthropic_claude_code_api";
const DEFAULT_VENDOR = "Anthropic";

await loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const dryRun = !args.apply;
const dateRange = resolveDateRange(args);
const vendorName = args.vendor ?? DEFAULT_VENDOR;
const source = args.source ?? DEFAULT_SOURCE;
const categorySlug = args.category ?? "";
const ingestedBy = args.ingestedBy ?? "finance:sync:claude-code";
const explicitSgdRate = args.sgdRate ? Number(args.sgdRate) : null;
const actorEmail = normalizeEmail(args.actorEmail ?? process.env.CLAUDE_CODE_ACTOR_EMAIL ?? "");

const dailyReports = args.fixture
  ? await readFixture(args.fixture)
  : await fetchClaudeCodeReports(dateRange);

const rows = [];
for (const report of dailyReports) {
  const row = await reportToExpenseRow(report, {
    vendorName,
    source,
    categorySlug,
    ingestedBy,
    explicitSgdRate,
    actorEmail,
  });
  if (row) rows.push(row);
}

const totalUsd = rows.reduce((acc, row) => acc + Number(row.original_amount), 0);
const totalSgd = rows.reduce((acc, row) => acc + Number(row.amount_sgd || 0), 0);

console.log(
  `[info] Claude Code sync range ${dateRange.from}..${dateRange.to} produced ${rows.length} ledger row(s)`
);
console.log(`[info] USD ${totalUsd.toFixed(2)} / SGD ${totalSgd.toFixed(2)}`);

if (dryRun) {
  console.log("[dry-run] no DB writes performed. Re-run with --apply to upsert finance_expenses.");
  console.log(JSON.stringify(rows.slice(0, 10), null, 2));
  process.exit(0);
}

if (rows.length === 0) {
  console.log("[ok] no Claude Code cost rows to upsert");
  process.exit(0);
}

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await ensureAnthropicVendor(supabase, {
  vendorName,
  categorySlug,
  source,
});

const { error } = await supabase
  .from("finance_expenses")
  .upsert(rows, { onConflict: "source,external_id" });
if (error) throw error;

console.log(`[ok] upserted ${rows.length} Claude Code cost row(s) into finance_expenses`);

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg.startsWith("--from=")) parsed.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) parsed.to = arg.slice("--to=".length);
    else if (arg.startsWith("--days=")) parsed.days = Number(arg.slice("--days=".length));
    else if (arg.startsWith("--lag-days=")) parsed.lagDays = Number(arg.slice("--lag-days=".length));
    else if (arg.startsWith("--source=")) parsed.source = arg.slice("--source=".length);
    else if (arg.startsWith("--vendor=")) parsed.vendor = arg.slice("--vendor=".length);
    else if (arg.startsWith("--category=")) parsed.category = arg.slice("--category=".length);
    else if (arg.startsWith("--ingested-by=")) parsed.ingestedBy = arg.slice("--ingested-by=".length);
    else if (arg.startsWith("--sgd-rate=")) parsed.sgdRate = arg.slice("--sgd-rate=".length);
    else if (arg.startsWith("--actor-email=")) parsed.actorEmail = arg.slice("--actor-email=".length);
    else if (arg.startsWith("--fixture=")) parsed.fixture = arg.slice("--fixture=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printUsage() {
  console.log(`
Claude Code finance sync

Fetches daily Claude Code Admin API usage and upserts one finance_expenses row per UTC day.

Usage:
  ANTHROPIC_ADMIN_API_KEY=... npm run finance:sync:claude-code -- --from=2026-07-01 --to=2026-07-03
  ANTHROPIC_ADMIN_API_KEY=... SUPABASE_SECRET_KEY=... npm run finance:sync:claude-code -- --days=30 --apply

Auth:
  ANTHROPIC_ADMIN_API_KEY / ADMIN_API_KEY  Uses x-api-key.
  ANTHROPIC_OAUTH_TOKEN                   Uses Authorization: Bearer.

Options:
  --from=YYYY-MM-DD       Start date inclusive.
  --to=YYYY-MM-DD         End date inclusive. Defaults to yesterday UTC.
  --days=30               Used when --from is omitted. Defaults to 30.
  --lag-days=1            Avoid partial fresh data. Defaults to 1.
  --sgd-rate=1.35         Optional fixed USD→SGD rate. Otherwise Frankfurter is used.
  --actor-email=...       Optional Claude Code actor email filter.
  --category=ai_tools     Optional finance category slug.
  --fixture=report.json   Test without hitting Anthropic.
  --apply                 Write to Supabase. Omit for dry-run.

Env:
  CLAUDE_CODE_ACTOR_EMAIL  Default actor email filter, e.g. jaehyung78@gmail.com.
`);
}

function resolveDateRange(options) {
  const lagDays = Number.isFinite(options.lagDays) ? options.lagDays : 1;
  const days = Number.isFinite(options.days) ? options.days : 30;
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  defaultTo.setUTCDate(defaultTo.getUTCDate() - lagDays);

  const to = options.to ?? isoDate(defaultTo);
  let from = options.from;
  if (!from) {
    const start = new Date(`${to}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - Math.max(days - 1, 0));
    from = isoDate(start);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("--from and --to must be YYYY-MM-DD");
  }
  if (from > to) throw new Error("--from must be on or before --to");

  return { from, to };
}

async function fetchClaudeCodeReports({ from, to }) {
  const reports = [];
  for (const day of eachDate(from, to)) {
    const records = await fetchClaudeCodeDay(day);
    reports.push({ date: day, records });
  }
  return reports;
}

async function fetchClaudeCodeDay(day) {
  const records = [];
  let page = null;

  do {
    const url = new URL("/v1/organizations/usage_report/claude_code", ANTHROPIC_API_BASE);
    url.searchParams.set("starting_at", day);
    url.searchParams.set("limit", "1000");
    if (page) url.searchParams.set("page", page);

    const response = await fetch(url, {
      headers: anthropicHeaders(),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude Code API ${response.status} for ${day}: ${body}`);
    }

    const payload = await response.json();
    records.push(...(payload.data ?? []));
    page = payload.has_more ? payload.next_page : null;
  } while (page);

  return records;
}

function anthropicHeaders() {
  const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY;
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
  const headers = {
    "anthropic-version": ANTHROPIC_VERSION,
    "user-agent": "StanceProFinance/1.0 (https://stance-pro.com)",
  };

  if (adminKey) {
    headers["x-api-key"] = adminKey;
  } else if (oauthToken) {
    headers.authorization = `Bearer ${oauthToken}`;
  } else {
    throw new Error("Missing ANTHROPIC_ADMIN_API_KEY, ADMIN_API_KEY, or ANTHROPIC_OAUTH_TOKEN.");
  }

  return headers;
}

async function reportToExpenseRow(report, options) {
  const records = options.actorEmail
    ? report.records.filter((record) => recordMatchesActorEmail(record, options.actorEmail))
    : report.records;
  const summary = summarizeReport(records);
  if (summary.costCents <= 0) return null;

  const transactionDate = report.date;
  const originalAmount = summary.costCents / 100;
  const fx = await usdToSgd(transactionDate, options.explicitSgdRate);
  const actorKey = options.actorEmail ? `:${options.actorEmail}` : "";
  const actorLabel = options.actorEmail ? ` for ${options.actorEmail}` : "";
  const row = {
    source: options.source,
    external_id: `claude_code${actorKey}:${transactionDate}`,
    ingest_fingerprint: `${options.source}:claude_code${actorKey}:${transactionDate}`,
    ingested_by: options.ingestedBy,
    vendor_name: options.vendorName,
    transaction_date: transactionDate,
    billing_period_start: transactionDate,
    billing_period_end: transactionDate,
    description: `Claude Code usage${actorLabel} (${summary.sessions} sessions, ${summary.actors} actor(s))`,
    original_amount: originalAmount,
    original_currency: "USD",
    amount_sgd: originalAmount * fx.rate,
    fx_rate_to_sgd: fx.rate,
    fx_rate_source: fx.source,
    fx_rate_date: fx.date,
    recurring: false,
    status: "needs_review",
    notes: [
      "Automated from Anthropic Claude Code Admin API.",
      options.actorEmail ? `actor_email=${options.actorEmail}` : "actor_email=all",
      `models=${summary.models.join(", ") || "unknown"}`,
      `input_tokens=${summary.tokens.input}`,
      `output_tokens=${summary.tokens.output}`,
      `cache_read=${summary.tokens.cache_read}`,
      `cache_creation=${summary.tokens.cache_creation}`,
    ].join(" "),
  };

  if (options.categorySlug) row.category_slug = options.categorySlug;
  return row;
}

function recordMatchesActorEmail(record, actorEmail) {
  return normalizeEmail(record.actor?.email_address ?? "") === actorEmail;
}

function summarizeReport(records) {
  let costCents = 0;
  let sessions = 0;
  const actors = new Set();
  const models = new Set();
  const tokens = {
    input: 0,
    output: 0,
    cache_read: 0,
    cache_creation: 0,
  };

  for (const record of records) {
    sessions += Number(record.core_metrics?.num_sessions ?? 0);
    const actor = record.actor?.email_address ?? record.actor?.api_key_name;
    if (actor) actors.add(actor);

    for (const modelRow of record.model_breakdown ?? []) {
      costCents += Number(modelRow.estimated_cost?.amount ?? 0);
      if (modelRow.model) models.add(modelRow.model);
      tokens.input += Number(modelRow.tokens?.input ?? 0);
      tokens.output += Number(modelRow.tokens?.output ?? 0);
      tokens.cache_read += Number(modelRow.tokens?.cache_read ?? 0);
      tokens.cache_creation += Number(modelRow.tokens?.cache_creation ?? 0);
    }
  }

  return {
    costCents,
    sessions,
    actors: actors.size,
    models: [...models].sort(),
    tokens,
  };
}

async function usdToSgd(date, explicitRate) {
  if (Number.isFinite(explicitRate) && explicitRate > 0) {
    return { rate: explicitRate, date, source: "manual_cli_rate" };
  }

  const url = `https://api.frankfurter.app/${date}?from=USD&to=SGD`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FX lookup failed for ${date}: ${response.status}`);
  }
  const payload = await response.json();
  const rate = Number(payload.rates?.SGD);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX lookup returned no USD→SGD rate for ${date}`);
  }
  return { rate, date: payload.date ?? date, source: "frankfurter.app" };
}

async function ensureAnthropicVendor(supabase, { vendorName, categorySlug, source }) {
  const vendor = {
    slug: slugify(vendorName),
    name: vendorName,
    default_currency: "USD",
    invoice_source: source,
    expected_frequency: "daily",
    notes: "Claude Code usage and Anthropic billing imported by finance automation.",
    active: true,
  };
  if (categorySlug) vendor.default_category_slug = categorySlug;

  const { error } = await supabase.from("finance_vendors").upsert(vendor, { onConflict: "slug" });
  if (error) throw error;
}

async function readFixture(fixturePath) {
  const payload = JSON.parse(await fs.readFile(path.resolve(fixturePath), "utf8"));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.reports)) return payload.reports;
  if (Array.isArray(payload.data)) {
    const date = payload.data[0]?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    return [{ date, records: payload.data }];
  }
  throw new Error("Fixture must be an array, { reports: [...] }, or Claude API { data: [...] } response.");
}

async function loadEnvFile(envPath) {
  try {
    const text = await fs.readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // .env.local is optional; CI/cron can provide environment variables directly.
  }
}

function* eachDate(from, to) {
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    yield isoDate(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}
