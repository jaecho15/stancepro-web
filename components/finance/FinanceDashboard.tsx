"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { ExpenseSection } from "@/components/finance/ExpenseSection";
import { StackedBurnChart } from "@/components/finance/StackedBurnChart";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  distinctFiscalYears,
  stackedMonthlyBurnByVendor,
  sumSgd,
  vendorSummaries,
} from "@/lib/finance/aggregates";
import { vendorColorMap } from "@/lib/finance/chart-colors";
import { prefetchNzdRates } from "@/lib/finance/fx";
import {
  fmtMoney,
  fiscalYearFromDate,
  fiscalYearLabel,
} from "@/lib/finance/format";
import type {
  DisplayCurrency,
  FinanceExpenseRow,
  FinanceReceiptRow,
  FinanceVendorRow,
} from "@/lib/finance/types";

const EXPENSE_SELECT =
  "id, transaction_date, vendor_name, description, original_amount, original_currency, amount_sgd, status, fiscal_year, fiscal_quarter, fiscal_month, category_slug, source, notes, receipt_storage_path, primary_receipt_id, audit_locked_at, external_id";

export function FinanceDashboard() {
  const { supabase, session, signOut } = useInternalAuth();
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [receipts, setReceipts] = useState<FinanceReceiptRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [vendors, setVendors] = useState<FinanceVendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fyFilter, setFyFilter] = useState<number>(() => fiscalYearFromDate());
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currency, setCurrency] = useState<DisplayCurrency>("SGD");
  const [nzdRates, setNzdRates] = useState<Map<string, number>>(new Map());

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [expResult, vendorResult, recResult] = await Promise.all([
      supabase
        .from("finance_expenses")
        .select(EXPENSE_SELECT)
        .order("transaction_date", { ascending: false })
        .limit(1000),
      supabase.from("finance_vendors").select("slug, name").order("name"),
      supabase
        .from("finance_receipts")
        .select("id, expense_id, storage_bucket, storage_path, original_filename, mime_type, source_reference")
        .not("expense_id", "is", null)
        .limit(2000),
    ]);

    if (expResult.error) {
      setError(expResult.error.message);
      setExpenses([]);
    } else {
      setExpenses((expResult.data ?? []) as FinanceExpenseRow[]);
    }

    if (!vendorResult.error) {
      setVendors((vendorResult.data ?? []) as FinanceVendorRow[]);
    }

    const recRows = (recResult.error ? [] : recResult.data ?? []) as FinanceReceiptRow[];
    setReceipts(recRows);

    const paths = new Set<string>();
    for (const e of expResult.data ?? []) {
      if (e.receipt_storage_path) paths.add(e.receipt_storage_path);
    }
    for (const r of recRows) paths.add(r.storage_path);

    const urlMap = new Map<string, string>();
    await Promise.all(
      [...paths].map(async (path) => {
        const { data } = await supabase.storage
          .from("finance-receipts")
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) urlMap.set(path, data.signedUrl);
      })
    );
    setSignedUrls(urlMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const fiscalYears = useMemo(() => distinctFiscalYears(expenses), [expenses]);

  useEffect(() => {
    if (fiscalYears.length > 0 && !fiscalYears.includes(fyFilter)) {
      setFyFilter(fiscalYears[0]);
    }
  }, [fiscalYears, fyFilter]);

  const fyRows = useMemo(
    () => expenses.filter((row) => row.fiscal_year === fyFilter),
    [expenses, fyFilter]
  );

  const filteredRows = useMemo(() => {
    return fyRows.filter((row) => {
      if (vendorFilter !== "all" && row.vendor_name !== vendorFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [fyRows, vendorFilter, statusFilter]);

  useEffect(() => {
    if (currency !== "NZD") return;
    const dates = filteredRows.map((r) => r.transaction_date);
    void prefetchNzdRates(dates).then((rates) => {
      const expanded = new Map(rates);
      for (const [d, r] of rates) expanded.set(d.slice(0, 7), r);
      setNzdRates(expanded);
    });
  }, [currency, filteredRows]);

  const receiptsByExpense = useMemo(() => {
    const map = new Map<string, FinanceReceiptRow[]>();
    for (const r of receipts) {
      if (!r.expense_id) continue;
      const list = map.get(r.expense_id) ?? [];
      list.push(r);
      map.set(r.expense_id, list);
    }
    return map;
  }, [receipts]);

  const vendorColors = useMemo(
    () => vendorColorMap(filteredRows.map((r) => r.vendor_name)),
    [filteredRows]
  );

  const totalSgd = sumSgd(filteredRows);
  const needsReview = filteredRows.filter((r) => r.status === "needs_review").length;
  const vendorsInFy = vendorSummaries(fyRows);
  const stackedBurn = stackedMonthlyBurnByVendor(filteredRows, vendorColors);

  const avgNzdRate = useMemo(() => {
    if (nzdRates.size === 0) return undefined;
    const vals = [...nzdRates.values()];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [nzdRates]);

  const vendorOptions = useMemo(() => {
    const fromRows = [...new Set(fyRows.map((r) => r.vendor_name))].sort();
    if (fromRows.length > 0) return fromRows;
    return vendors.map((v) => v.name);
  }, [fyRows, vendors]);

  const uncoveredVendors = vendors.filter(
    (v) => !expenses.some((e) => e.vendor_name === v.name)
  );

  const subtitle =
    currency === "SGD"
      ? "StancePro Pte Ltd · SGD ledger"
      : "StancePro Pte Ltd · NZD view (ECB via SGD)";

  return (
    <InternalChrome
      title="Finance"
      subtitle={subtitle}
      email={session?.user?.email}
      onSignOut={signOut}
      backHref="/internal"
    >
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(fiscalYears.length ? fiscalYears : [fyFilter]).map((fy) => (
              <button
                key={fy}
                type="button"
                onClick={() => setFyFilter(fy)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  fyFilter === fy
                    ? "bg-brand-600 text-white"
                    : "border border-white/10 text-slate-300 hover:bg-white/5"
                }`}
              >
                {fiscalYearLabel(fy)}
              </button>
            ))}
          </div>
          <CurrencyToggle currency={currency} onChange={setCurrency} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label={`${fiscalYearLabel(fyFilter)} spend`}
            value={fmtMoney(totalSgd, currency, avgNzdRate)}
          />
          <SummaryCard label="Rows" value={String(filteredRows.length)} />
          <SummaryCard
            label="Needs review"
            value={String(needsReview)}
            accent={needsReview > 0 ? "amber" : undefined}
          />
          <SummaryCard label="Vendors with data" value={String(vendorsInFy.length)} />
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">Filing readiness</h2>
          <p className="mt-1 text-sm text-slate-400">
            Oct–Sep fiscal year · toggle NZD for NZ-side review · invoices attach per row
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>
              {needsReview === 0
                ? "✓ No rows pending review in this FY filter"
                : `· ${needsReview} row(s) still marked needs_review`}
            </li>
            <li>
              {uncoveredVendors.length === 0
                ? "✓ All seeded vendors have at least one ledger row"
                : `· ${uncoveredVendors.length} vendor(s) with no data yet`}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">
            Monthly burn — stacked by vendor ({currency})
          </h2>
          <StackedBurnChart
            months={stackedBurn}
            currency={currency}
            nzdRates={nzdRates}
          />
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">By vendor ({currency})</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Vendor</th>
                  <th className="pb-2 pr-4 text-right font-medium">Rows</th>
                  <th className="pb-2 pr-4 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {vendorsInFy.map((v) => (
                  <tr key={v.vendor} className="border-b border-white/5 text-slate-200">
                    <td className="py-2 pr-4">{v.vendor}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{v.rows}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {fmtMoney(v.totalSgd, currency, avgNzdRate)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{v.needsReview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 pb-2">
          <FilterSelect
            label="Vendor"
            value={vendorFilter}
            onChange={setVendorFilter}
            options={[
              { value: "all", label: "All vendors" },
              ...vendorOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All statuses" },
              { value: "needs_review", label: "Needs review" },
              { value: "approved", label: "Approved" },
              { value: "ignored", label: "Ignored" },
            ]}
          />
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="self-end rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {supabase ? (
          <ExpenseSection
            supabase={supabase}
            userEmail={session?.user?.email}
            rows={filteredRows}
            receiptsByExpense={receiptsByExpense}
            signedUrls={signedUrls}
            vendorOptions={vendorOptions}
            currency={currency}
            nzdRates={nzdRates}
            loading={loading}
            onRefresh={() => void loadData()}
          />
        ) : null}
      </main>
    </InternalChrome>
  );
}

function CurrencyToggle({
  currency,
  onChange,
}: {
  currency: DisplayCurrency;
  onChange: (c: DisplayCurrency) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 p-1 text-sm">
      {(["SGD", "NZD"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            currency === c ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/50 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          accent === "amber" ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
