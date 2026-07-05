#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co";
const DEFAULT_SOURCE = "anthropic_billing_csv";
const DEFAULT_VENDOR = "Anthropic";
const DEFAULT_CATEGORY = "";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.csv) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const csvPath = path.resolve(args.csv);
const dryRun = !args.apply;
const source = args.source ?? DEFAULT_SOURCE;
const vendorName = args.vendor ?? DEFAULT_VENDOR;
const categorySlug = args.category ?? DEFAULT_CATEGORY;
const ingestedBy = args.ingestedBy ?? "finance:import:claude";
const sgdRate = args.sgdRate ? Number(args.sgdRate) : null;

const csvText = await fs.readFile(csvPath, "utf8");
const records = parseCsv(csvText);
const rows = records.map((record, index) =>
  toExpenseRow(record, {
    index,
    source,
    vendorName,
    categorySlug,
    ingestedBy,
    sgdRate,
  })
);

if (rows.length === 0) {
  console.log("[info] no Claude/Anthropic cost rows found");
  process.exit(0);
}

const totalByCurrency = new Map();
for (const row of rows) {
  totalByCurrency.set(
    row.original_currency,
    (totalByCurrency.get(row.original_currency) ?? 0) + Number(row.original_amount)
  );
}

console.log(`[info] parsed ${rows.length} Claude/Anthropic cost row(s) from ${csvPath}`);
for (const [currency, total] of totalByCurrency.entries()) {
  console.log(`[info] ${currency} ${total.toFixed(2)}`);
}

if (dryRun) {
  console.log("[dry-run] no DB writes performed. Re-run with --apply to upsert finance_expenses.");
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
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

if (error) {
  throw error;
}

console.log(`[ok] upserted ${rows.length} Claude/Anthropic cost row(s) into finance_expenses`);

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg.startsWith("--csv=")) parsed.csv = arg.slice("--csv=".length);
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
Claude/Anthropic finance import

Usage:
  npm run finance:import:claude -- --csv=/path/to/anthropic.csv
  SUPABASE_SECRET_KEY=... npm run finance:import:claude -- --csv=/path/to/anthropic.csv --apply

Accepted CSV columns, case-insensitive:
  date | transaction_date | invoice_date
  amount | total | total_amount | amount_usd
  currency | original_currency
  invoice_id | invoice | receipt_id | id
  description | memo | product
  period_start | billing_period_start
  period_end | billing_period_end

Optional:
  --vendor=Anthropic
  --category=ai_tools              # optional; omit if the category is not seeded yet
  --source=anthropic_billing_csv
  --sgd-rate=1.35                  # required for non-SGD CSVs without amount_sgd
`);
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeKey);
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? "";
    });
    return record;
  });
}

function toExpenseRow(record, options) {
  const transactionDate = readDate(record, ["transaction_date", "invoice_date", "date", "created"]);
  const amount = readNumber(record, ["amount", "total", "total_amount", "amount_usd", "subtotal"]);
  const currency = readString(record, ["currency", "original_currency"]) || "USD";
  const amountSgd = readAmountSgd(record, amount, currency, options.sgdRate);
  const invoiceId = readString(record, ["invoice_id", "invoice", "receipt_id", "id"]);
  const description =
    readString(record, ["description", "memo", "product", "plan"]) || "Claude Code / Anthropic usage";
  const periodStart = readDate(record, ["billing_period_start", "period_start", "start_date"], false);
  const periodEnd = readDate(record, ["billing_period_end", "period_end", "end_date"], false);
  const externalId = invoiceId || fingerprint([transactionDate, amount, currency, description]);

  if (!transactionDate) {
    throw new Error(`Row ${options.index + 2}: missing date/transaction_date/invoice_date`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Row ${options.index + 2}: missing positive amount`);
  }

  const row = {
    source: options.source,
    external_id: `anthropic:${externalId}`,
    ingest_fingerprint: fingerprint([options.source, externalId, transactionDate, amount, currency]),
    ingested_by: options.ingestedBy,
    vendor_name: options.vendorName,
    transaction_date: transactionDate,
    description,
    original_amount: amount,
    original_currency: currency.toUpperCase(),
    amount_sgd: amountSgd.amount,
    fx_rate_to_sgd: amountSgd.rate,
    fx_rate_source: amountSgd.source,
    fx_rate_date: transactionDate,
    recurring: true,
    status: "needs_review",
    notes: "Imported from Claude/Anthropic billing CSV. Attach invoice PDF when available.",
  };

  if (options.categorySlug) row.category_slug = options.categorySlug;
  if (periodStart) row.billing_period_start = periodStart;
  if (periodEnd) row.billing_period_end = periodEnd;

  return row;
}

async function ensureAnthropicVendor(supabase, { vendorName, categorySlug, source }) {
  const vendor = {
    slug: slugify(vendorName),
    name: vendorName,
    default_currency: "USD",
    invoice_source: source,
    expected_frequency: "monthly",
    notes: "Claude Code / Anthropic subscription and usage billing.",
    active: true,
  };
  if (categorySlug) vendor.default_category_slug = categorySlug;

  const { error } = await supabase.from("finance_vendors").upsert(vendor, { onConflict: "slug" });

  if (error) throw error;
}

function normalizeKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readString(record, keys) {
  for (const key of keys) {
    const value = record[normalizeKey(key)];
    if (value) return value.trim();
  }
  return "";
}

function readDate(record, keys, required = true) {
  const raw = readString(record, keys);
  if (!raw) {
    if (required) return "";
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    if (required) throw new Error(`Invalid date: ${raw}`);
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function readNumber(record, keys) {
  const raw = readString(record, keys);
  if (!raw) return Number.NaN;
  return Number(raw.replace(/[^0-9.-]+/g, ""));
}

function readAmountSgd(record, amount, currency, sgdRate) {
  const explicitAmount = readNumber(record, ["amount_sgd", "sgd_amount", "total_sgd"]);
  if (Number.isFinite(explicitAmount) && explicitAmount > 0) {
    return {
      amount: explicitAmount,
      rate: explicitAmount / amount,
      source: "csv_amount_sgd",
    };
  }

  if (currency.toUpperCase() === "SGD") {
    return { amount, rate: 1, source: "identity" };
  }

  if (Number.isFinite(sgdRate) && sgdRate > 0) {
    return {
      amount: amount * sgdRate,
      rate: sgdRate,
      source: "manual_cli_rate",
    };
  }

  throw new Error(
    `Missing SGD conversion for ${currency}. Add amount_sgd to the CSV or pass --sgd-rate=...`
  );
}

function fingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
