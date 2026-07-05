#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_SUPABASE_URL = "https://ryiitcblrrqvjvxkobpf.supabase.co";
const DEFAULT_SOURCE = "anthropic_receipt_pdf";
const DEFAULT_VENDOR = "Anthropic";
const DEFAULT_DIR =
  "/Users/jchomba2025/Library/CloudStorage/GoogleDrive-jae.cho@stance-pro.com/My Drive/StancePro Admin/AGM/Annual filings/FY2025/JCK FY25 Invoices/Anthropic";
const DEFAULT_SUPABASE_CLI_WORKDIR = "/Users/jchomba2025/App_Dev/StancePro/StancePro";

await loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printUsage();
  process.exit(0);
}

const receiptsDir = path.resolve(args.dir ?? process.env.ANTHROPIC_RECEIPTS_DIR ?? DEFAULT_DIR);
const dryRun = !(args.apply || args.applyViaCli);
const source = args.source ?? DEFAULT_SOURCE;
const vendorName = args.vendor ?? DEFAULT_VENDOR;
const categorySlug = args.category ?? "";
const accountEmail = normalizeEmail(args.accountEmail ?? process.env.CLAUDE_MAX_ACCOUNT_EMAIL ?? "");
const explicitSgdRate = args.sgdRate ? Number(args.sgdRate) : null;
const ingestedBy = args.ingestedBy ?? "finance:import:anthropic-receipts";
const supabaseCliWorkdir = path.resolve(
  args.supabaseWorkdir ?? process.env.SUPABASE_CLI_WORKDIR ?? DEFAULT_SUPABASE_CLI_WORKDIR
);

const files = await listReceiptFiles(receiptsDir);
const parsed = [];
for (const file of files) {
  const receipt = await parseReceipt(file, {
    source,
    vendorName,
    categorySlug,
    accountEmail,
    explicitSgdRate,
    ingestedBy,
  });
  parsed.push(receipt);
}

console.log(`[info] scanned ${files.length} Anthropic receipt file(s) from ${receiptsDir}`);
console.log(`[info] parsed ${parsed.length} receipt row(s)`);

if (dryRun) {
  console.log("[dry-run] no DB writes performed. Re-run with --apply to upsert rows and upload receipts.");
  console.log(JSON.stringify(parsed.map(({ filePath, ...row }) => row), null, 2));
  process.exit(0);
}

if (parsed.length === 0) {
  console.log("[ok] no Anthropic receipts to import");
  process.exit(0);
}

if (args.applyViaCli) {
  await applyViaSupabaseCli(parsed, {
    categorySlug,
    source,
    supabaseCliWorkdir,
    vendorName,
  });
  console.log(`[ok] imported ${parsed.length} Anthropic receipt(s) into finance_expenses via Supabase CLI`);
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

let imported = 0;
for (const receipt of parsed) {
  const { filePath, storagePath, receiptSha256, ...expenseRow } = receipt;
  const { data: expenses, error: expenseError } = await supabase
    .from("finance_expenses")
    .upsert(expenseRow, { onConflict: "source,external_id" })
    .select("id")
    .limit(1);
  if (expenseError) throw expenseError;
  const expenseId = expenses?.[0]?.id;
  if (!expenseId) throw new Error(`No expense id returned for ${expenseRow.external_id}`);

  const fileBuffer = await fs.readFile(filePath);
  const { error: uploadError } = await supabase.storage
    .from("finance-receipts")
    .upload(storagePath, fileBuffer, {
      upsert: true,
      contentType: contentTypeFor(filePath),
    });
  if (uploadError) throw uploadError;

  const { data: receipts, error: receiptError } = await supabase
    .from("finance_receipts")
    .upsert(
      {
        expense_id: expenseId,
        storage_bucket: "finance-receipts",
        storage_path: storagePath,
        original_filename: path.basename(filePath),
        mime_type: contentTypeFor(filePath),
        size_bytes: fileBuffer.length,
        sha256: receiptSha256,
        source,
        source_reference: filePath,
        captured_by: ingestedBy,
      },
      { onConflict: "storage_bucket,storage_path" }
    )
    .select("id")
    .limit(1);
  if (receiptError) throw receiptError;

  const receiptId = receipts?.[0]?.id;
  const { error: linkError } = await supabase
    .from("finance_expenses")
    .update({
      primary_receipt_id: receiptId ?? null,
      receipt_storage_path: storagePath,
      receipt_sha256: receiptSha256,
    })
    .eq("id", expenseId);
  if (linkError) throw linkError;
  imported += 1;
}

console.log(`[ok] imported ${imported} Anthropic receipt(s) into finance_expenses`);

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg.startsWith("--dir=")) parsed.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--source=")) parsed.source = arg.slice("--source=".length);
    else if (arg.startsWith("--vendor=")) parsed.vendor = arg.slice("--vendor=".length);
    else if (arg.startsWith("--category=")) parsed.category = arg.slice("--category=".length);
    else if (arg.startsWith("--account-email=")) parsed.accountEmail = arg.slice("--account-email=".length);
    else if (arg.startsWith("--sgd-rate=")) parsed.sgdRate = arg.slice("--sgd-rate=".length);
    else if (arg.startsWith("--ingested-by=")) parsed.ingestedBy = arg.slice("--ingested-by=".length);
    else if (arg === "--apply-via-cli") parsed.applyViaCli = true;
    else if (arg.startsWith("--supabase-workdir="))
      parsed.supabaseWorkdir = arg.slice("--supabase-workdir=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printUsage() {
  console.log(`
Anthropic/Claude receipt import

Scans the Annual Filing Anthropic folder, parses receipt PDFs, creates finance_expenses rows,
uploads the PDF to finance-receipts Storage, and links the receipt row.

Default folder:
  ${DEFAULT_DIR}

Usage:
  npm run finance:import:anthropic-receipts
  SUPABASE_SECRET_KEY=... npm run finance:import:anthropic-receipts -- --apply
  npm run finance:import:anthropic-receipts -- --apply-via-cli

Options:
  --dir=/path/to/Anthropic
  --account-email=jaehyung78@gmail.com
  --sgd-rate=1.35         Optional fixed USD→SGD rate. Otherwise Frankfurter is used.
  --category=ai_tools     Optional finance category slug.
  --apply                 Write to Supabase and upload receipts. Omit for dry-run.
  --apply-via-cli          Write using the linked Supabase CLI project instead of a secret key.
  --supabase-workdir=...   Supabase CLI workdir. Defaults to the StancePro Supabase project.
`);
}

async function applyViaSupabaseCli(parsed, { categorySlug, source, supabaseCliWorkdir, vendorName }) {
  runSupabaseCli(
    [
      "db",
      "query",
      "--linked",
      vendorUpsertSql({
        categorySlug,
        source,
        vendorName,
      }),
    ],
    supabaseCliWorkdir
  );

  for (const receipt of parsed) {
    const { filePath, storagePath, receiptSha256, ...expenseRow } = receipt;
    runSupabaseCli(
      [
        "storage",
        "cp",
        filePath,
        `ss:///finance-receipts/${storagePath}`,
        "--content-type",
        contentTypeFor(filePath),
        "--linked",
      ],
      supabaseCliWorkdir
    );

    const stat = await fs.stat(filePath);
    runSupabaseCli(
      [
        "db",
        "query",
        "--linked",
        receiptUpsertSql({
          expenseRow,
          filePath,
          receiptSha256,
          sizeBytes: stat.size,
          source,
          storagePath,
        }),
      ],
      supabaseCliWorkdir
    );
  }

  runSupabaseCli(
    [
      "db",
      "query",
      "--linked",
      `
update public.finance_expenses e
set
  primary_receipt_id = r.id,
  receipt_storage_path = r.storage_path,
  receipt_sha256 = r.sha256,
  updated_at = now()
from public.finance_receipts r
where r.expense_id = e.id
  and e.source = ${sqlLiteral(source)}
  and r.source = ${sqlLiteral(source)};
`,
    ],
    supabaseCliWorkdir
  );
}

function vendorUpsertSql({ categorySlug, source, vendorName }) {
  const columns = [
    "slug",
    "name",
    "default_currency",
    "invoice_source",
    "expected_frequency",
    "notes",
    "active",
  ];
  const values = [
    sqlLiteral(slugify(vendorName)),
    sqlLiteral(vendorName),
    sqlLiteral("USD"),
    sqlLiteral(source),
    sqlLiteral("monthly"),
    sqlLiteral("Anthropic/Claude receipts imported from Annual Filing folder."),
    "true",
  ];
  const updates = [
    "name = excluded.name",
    "default_currency = excluded.default_currency",
    "invoice_source = excluded.invoice_source",
    "expected_frequency = excluded.expected_frequency",
    "notes = excluded.notes",
    "active = excluded.active",
  ];

  if (categorySlug) {
    columns.push("default_category_slug");
    values.push(sqlLiteral(categorySlug));
    updates.push("default_category_slug = excluded.default_category_slug");
  }

  return `
insert into public.finance_vendors (${columns.join(", ")})
values (${values.join(", ")})
on conflict (slug) do update set
  ${updates.join(",\n  ")};
`;
}

function receiptUpsertSql({ expenseRow, filePath, receiptSha256, sizeBytes, source, storagePath }) {
  return `
with upsert_expense as (
  insert into public.finance_expenses (
    external_id,
    source,
    ingest_fingerprint,
    ingested_by,
    vendor_name,
    transaction_date,
    billing_period_start,
    billing_period_end,
    description,
    original_amount,
    original_currency,
    amount_sgd,
    fx_rate_to_sgd,
    fx_rate_source,
    fx_rate_date,
    recurring,
    status,
    notes
  )
  values (
    ${sqlLiteral(expenseRow.external_id)},
    ${sqlLiteral(expenseRow.source)},
    ${sqlLiteral(expenseRow.ingest_fingerprint)},
    ${sqlLiteral(expenseRow.ingested_by)},
    ${sqlLiteral(expenseRow.vendor_name)},
    ${sqlLiteral(expenseRow.transaction_date)}::date,
    ${sqlLiteral(expenseRow.billing_period_start)}::date,
    ${sqlLiteral(expenseRow.billing_period_end)}::date,
    ${sqlLiteral(expenseRow.description)},
    ${sqlNumber(expenseRow.original_amount)},
    ${sqlLiteral(expenseRow.original_currency)},
    ${sqlNumber(expenseRow.amount_sgd)},
    ${sqlNumber(expenseRow.fx_rate_to_sgd)},
    ${sqlLiteral(expenseRow.fx_rate_source)},
    ${sqlLiteral(expenseRow.fx_rate_date)}::date,
    ${sqlBoolean(expenseRow.recurring)},
    ${sqlLiteral(expenseRow.status)},
    ${sqlLiteral(expenseRow.notes)}
  )
  on conflict (source, external_id) where external_id is not null do update set
    ingest_fingerprint = excluded.ingest_fingerprint,
    ingested_by = excluded.ingested_by,
    vendor_name = excluded.vendor_name,
    transaction_date = excluded.transaction_date,
    billing_period_start = excluded.billing_period_start,
    billing_period_end = excluded.billing_period_end,
    description = excluded.description,
    original_amount = excluded.original_amount,
    original_currency = excluded.original_currency,
    amount_sgd = excluded.amount_sgd,
    fx_rate_to_sgd = excluded.fx_rate_to_sgd,
    fx_rate_source = excluded.fx_rate_source,
    fx_rate_date = excluded.fx_rate_date,
    recurring = excluded.recurring,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now()
  returning id
),
upsert_receipt as (
  insert into public.finance_receipts (
    expense_id,
    storage_bucket,
    storage_path,
    original_filename,
    mime_type,
    size_bytes,
    sha256,
    source,
    source_reference,
    captured_by
  )
  select
    id,
    'finance-receipts',
    ${sqlLiteral(storagePath)},
    ${sqlLiteral(path.basename(filePath))},
    ${sqlLiteral(contentTypeFor(filePath))},
    ${sqlNumber(sizeBytes)},
    ${sqlLiteral(receiptSha256)},
    ${sqlLiteral(source)},
    ${sqlLiteral(filePath)},
    ${sqlLiteral(expenseRow.ingested_by)}
  from upsert_expense
  on conflict (storage_bucket, storage_path) do update set
    expense_id = excluded.expense_id,
    original_filename = excluded.original_filename,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    sha256 = excluded.sha256,
    source = excluded.source,
    source_reference = excluded.source_reference,
    captured_by = excluded.captured_by
  returning id
)
update public.finance_expenses
set
  primary_receipt_id = (select id from upsert_receipt),
  receipt_storage_path = ${sqlLiteral(storagePath)},
  receipt_sha256 = ${sqlLiteral(receiptSha256)},
  updated_at = now()
where id = (select id from upsert_expense);
`;
}

async function listReceiptFiles(dir) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await walk(dir);
  const pdfs = entries.filter((file) => /\.(pdf)$/i.test(file)).sort();
  const receipts = pdfs.filter((file) => /receipt/i.test(path.basename(file)));
  return receipts.length > 0 ? receipts : pdfs;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function parseReceipt(filePath, options) {
  const text = extractPdfText(filePath);
  const receiptSha256 = sha256(await fs.readFile(filePath));
  const parsed = parseAnthropicReceiptText(text, path.basename(filePath));
  const fx = await usdToSgd(parsed.transactionDate, options.explicitSgdRate, parsed.currency);
  const externalKey = parsed.invoiceId || receiptSha256.slice(0, 16);
  const safeKey = externalKey.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const storagePath = `anthropic/${parsed.transactionDate}-${safeKey}-${path.basename(filePath).replace(/[^\w.-]+/g, "_")}`;

  const row = {
    filePath,
    storagePath,
    receiptSha256,
    source: options.source,
    external_id: `anthropic_receipt:${externalKey}`,
    ingest_fingerprint: `${options.source}:${receiptSha256}`,
    ingested_by: options.ingestedBy,
    vendor_name: options.vendorName,
    transaction_date: parsed.transactionDate,
    billing_period_start: parsed.periodStart ?? parsed.transactionDate,
    billing_period_end: parsed.periodEnd ?? parsed.transactionDate,
    description: parsed.description,
    original_amount: parsed.amount,
    original_currency: parsed.currency,
    amount_sgd: parsed.amount * fx.rate,
    fx_rate_to_sgd: fx.rate,
    fx_rate_source: fx.source,
    fx_rate_date: fx.date,
    recurring: true,
    status: "needs_review",
    notes: [
      "Imported from Anthropic/Claude receipt PDF.",
      options.accountEmail ? `account_email=${options.accountEmail}` : "account_email=unknown",
      parsed.invoiceId ? `invoice_id=${parsed.invoiceId}` : "invoice_id=unknown",
    ].join(" "),
  };
  if (options.categorySlug) row.category_slug = options.categorySlug;
  return row;
}

function extractPdfText(filePath) {
  const code = `
import sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
parts = []
for page in reader.pages:
    parts.append(page.extract_text() or "")
print("\\n".join(parts))
`;
  const result = spawnSync("python3", ["-c", code, filePath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract PDF text from ${filePath}: ${result.stderr}`);
  }
  return result.stdout;
}

function parseAnthropicReceiptText(text, filename) {
  const normalized = text.replace(/\u0000/g, "-").replace(/\s+/g, " ").trim();
  const invoiceId =
    matchFirst(normalized, [
      /(?:invoice|receipt)\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9_-]{4,})/i,
      /\b(in_[A-Za-z0-9_]+)\b/,
      /\b([A-Z0-9]{8,}-[A-Z0-9-]{4,})\b/i,
    ]) ?? null;
  const transactionDate =
    parseDate(
      matchFirst(normalized, [
        /(?:date|paid on|invoice date|receipt date)\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
        /(?:date paid|paid on)\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
        /(?:date|paid on|invoice date|receipt date)\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
        /([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/,
        /(\d{4}-\d{2}-\d{2})/,
      ])
    ) ?? parseDateFromFilename(filename);

  const amountMatch =
    matchFirst(normalized, [
      /(?:amount paid|total paid)\s*:?\s*(US\$|\$|USD|SGD|S\$)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
      /(US\$|\$|USD|SGD|S\$)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)\s+paid\b/i,
      /\bpaid\s+(?:on\s+[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}\s+)?(US\$|\$|USD|SGD|S\$)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
      /(?:total|amount due)\s*:?\s*(US\$|\$|USD|SGD|S\$)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
      /(US\$|\$|USD|SGD|S\$)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    ], true);

  if (!transactionDate) {
    throw new Error(`Could not parse receipt date from ${filename}`);
  }
  if (!amountMatch) {
    throw new Error(`Could not parse receipt amount from ${filename}`);
  }

  const currencyToken = (amountMatch[1] || "USD").toUpperCase();
  const currency = currencyToken.includes("SGD") || currencyToken.includes("S$") ? "SGD" : "USD";
  const amount = Number(amountMatch[2].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid receipt amount in ${filename}`);
  }

  return {
    invoiceId,
    transactionDate,
    periodStart: null,
    periodEnd: null,
    amount,
    currency,
    description: "Claude Max subscription",
  };
}

function matchFirst(text, patterns, returnMatch = false) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return returnMatch ? match : match[1];
  }
  return null;
}

function parseDate(value) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;

  const monthDate = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/);
  if (monthDate) {
    const monthIndex = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ].indexOf(monthDate[1].toLowerCase());
    if (monthIndex >= 0) {
      return `${monthDate[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        Number(monthDate[2])
      ).padStart(2, "0")}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateFromFilename(filename) {
  const match = filename.match(/(20\d{2})[-_ ]?(\d{2})[-_ ]?(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function usdToSgd(date, explicitRate, currency) {
  if (currency === "SGD") return { rate: 1, date, source: "identity" };
  if (Number.isFinite(explicitRate) && explicitRate > 0) {
    return { rate: explicitRate, date, source: "manual_cli_rate" };
  }

  const url = `https://api.frankfurter.app/${date}?from=USD&to=SGD`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FX lookup failed for ${date}: ${response.status}`);
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
    notes: "Anthropic/Claude receipts imported from Annual Filing folder.",
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
    // Optional.
  }
}

function contentTypeFor(filePath) {
  return /\.pdf$/i.test(filePath) ? "application/pdf" : "application/octet-stream";
}

function runSupabaseCli(args, workdir) {
  const globalArgs = ["--workdir", workdir];
  if (args[0] === "storage") globalArgs.push("--experimental");

  const result = spawnSync("supabase", [...globalArgs, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sqlLiteral(value) {
  if (value == null) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  if (value == null || value === "") return "null";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid SQL number: ${value}`);
  return String(number);
}

function sqlBoolean(value) {
  return value ? "true" : "false";
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}
