#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co";
const DEFAULT_SOURCE = "anthropic_claude_max_subscription";
const DEFAULT_VENDOR = "Anthropic";
const DEFAULT_PLAN = "Claude Max";

await loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const dryRun = !args.apply;
const monthlyUsd = numberArg(
  args.monthlyUsd ?? process.env.CLAUDE_MAX_MONTHLY_USD,
  "CLAUDE_MAX_MONTHLY_USD or --monthly-usd"
);
const billingDay = intArg(
  args.billingDay ?? process.env.CLAUDE_MAX_BILLING_DAY ?? "1",
  "CLAUDE_MAX_BILLING_DAY or --billing-day"
);
const from = args.from ?? process.env.CLAUDE_MAX_FROM;
const to = args.to ?? new Date().toISOString().slice(0, 10);
const accountEmail = normalizeEmail(
  args.accountEmail ?? process.env.CLAUDE_MAX_ACCOUNT_EMAIL ?? ""
);
const vendorName = args.vendor ?? DEFAULT_VENDOR;
const planName = args.plan ?? process.env.CLAUDE_MAX_PLAN_NAME ?? DEFAULT_PLAN;
const source = args.source ?? DEFAULT_SOURCE;
const categorySlug = args.category ?? "";
const ingestedBy = args.ingestedBy ?? "finance:sync:claude-max";
const explicitSgdRate = args.sgdRate ? Number(args.sgdRate) : null;

if (!from) {
  throw new Error("Missing CLAUDE_MAX_FROM or --from=YYYY-MM-DD.");
}
if (billingDay < 1 || billingDay > 31) {
  throw new Error("--billing-day must be between 1 and 31.");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
  throw new Error("--from and --to must be YYYY-MM-DD.");
}

const rows = [];
for (const billDate of monthlyBillDates({ from, to, billingDay })) {
  const fx = await usdToSgd(billDate, explicitSgdRate);
  const actorKey = accountEmail ? `:${accountEmail}` : "";
  const row = {
    source,
    external_id: `claude_max${actorKey}:${billDate}`,
    ingest_fingerprint: `${source}:claude_max${actorKey}:${billDate}`,
    ingested_by: ingestedBy,
    vendor_name: vendorName,
    transaction_date: billDate,
    billing_period_start: billDate,
    billing_period_end: periodEndFor(billDate),
    description: accountEmail
      ? `${planName} subscription for ${accountEmail}`
      : `${planName} subscription`,
    original_amount: monthlyUsd,
    original_currency: "USD",
    amount_sgd: monthlyUsd * fx.rate,
    fx_rate_to_sgd: fx.rate,
    fx_rate_source: fx.source,
    fx_rate_date: fx.date,
    recurring: true,
    status: "needs_review",
    notes: [
      "Automated Claude Max subscription estimate.",
      accountEmail ? `account_email=${accountEmail}` : "account_email=unknown",
      "Attach claude.ai/Stripe invoice PDF when available.",
    ].join(" "),
  };
  if (categorySlug) row.category_slug = categorySlug;
  rows.push(row);
}

const totalUsd = rows.reduce((acc, row) => acc + Number(row.original_amount), 0);
const totalSgd = rows.reduce((acc, row) => acc + Number(row.amount_sgd || 0), 0);

console.log(`[info] Claude Max subscription produced ${rows.length} ledger row(s)`);
console.log(`[info] USD ${totalUsd.toFixed(2)} / SGD ${totalSgd.toFixed(2)}`);

if (dryRun) {
  console.log("[dry-run] no DB writes performed. Re-run with --apply to upsert finance_expenses.");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (rows.length === 0) {
  console.log("[ok] no Claude Max subscription rows to upsert");
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

console.log(`[ok] upserted ${rows.length} Claude Max subscription row(s) into finance_expenses`);

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg.startsWith("--from=")) parsed.from = arg.slice("--from=".length);
    else if (arg.startsWith("--to=")) parsed.to = arg.slice("--to=".length);
    else if (arg.startsWith("--monthly-usd=")) parsed.monthlyUsd = arg.slice("--monthly-usd=".length);
    else if (arg.startsWith("--billing-day=")) parsed.billingDay = arg.slice("--billing-day=".length);
    else if (arg.startsWith("--account-email=")) parsed.accountEmail = arg.slice("--account-email=".length);
    else if (arg.startsWith("--plan=")) parsed.plan = arg.slice("--plan=".length);
    else if (arg.startsWith("--source=")) parsed.source = arg.slice("--source=".length);
    else if (arg.startsWith("--vendor=")) parsed.vendor = arg.slice("--vendor=".length);
    else if (arg.startsWith("--category=")) parsed.category = arg.slice("--category=".length);
    else if (arg.startsWith("--ingested-by=")) parsed.ingestedBy = arg.slice("--ingested-by=".length);
    else if (arg.startsWith("--sgd-rate=")) parsed.sgdRate = arg.slice("--sgd-rate=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printUsage() {
  console.log(`
Claude Max subscription finance sync

Generates monthly finance_expenses rows for a claude.ai/Desktop Claude Max subscription.

Usage:
  npm run finance:sync:claude-max -- --from=2026-07-01 --monthly-usd=100 --billing-day=1
  SUPABASE_SECRET_KEY=... npm run finance:sync:claude-max -- --from=2026-07-01 --monthly-usd=100 --billing-day=1 --apply

Recommended .env.local:
  CLAUDE_MAX_ACCOUNT_EMAIL=jaehyung78@gmail.com
  CLAUDE_MAX_MONTHLY_USD=100
  CLAUDE_MAX_BILLING_DAY=1
  CLAUDE_MAX_FROM=2026-07-01

Options:
  --from=YYYY-MM-DD       First month/date to include.
  --to=YYYY-MM-DD         Last date to include. Defaults to today.
  --monthly-usd=100       Monthly Claude Max amount in USD.
  --billing-day=1         Day of month charged.
  --account-email=...     Account paying for Claude Max.
  --plan="Claude Max"     Display plan name.
  --sgd-rate=1.35         Optional fixed USD→SGD rate. Otherwise Frankfurter is used.
  --category=ai_tools     Optional finance category slug.
  --apply                 Write to Supabase. Omit for dry-run.
`);
}

function* monthlyBillDates({ from, to, billingDay }) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  let year = fromDate.getUTCFullYear();
  let month = fromDate.getUTCMonth();

  while (true) {
    const day = Math.min(billingDay, daysInMonth(year, month));
    const billDate = new Date(Date.UTC(year, month, day));
    if (billDate > toDate) return;
    if (billDate >= fromDate) yield isoDate(billDate);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
}

function periodEndFor(billDate) {
  const date = new Date(`${billDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return isoDate(date);
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
    expected_frequency: "monthly",
    notes: "Claude Max subscription billing imported by finance automation.",
    active: true,
  };
  if (categorySlug) vendor.default_category_slug = categorySlug;

  const { error } = await supabase.from("finance_vendors").upsert(vendor, { onConflict: "slug" });
  if (error) throw error;
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

function numberArg(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Missing positive ${label}.`);
  return number;
}

function intArg(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`Missing integer ${label}.`);
  return number;
}

function daysInMonth(year, zeroIndexedMonth) {
  return new Date(Date.UTC(year, zeroIndexedMonth + 1, 0)).getUTCDate();
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
