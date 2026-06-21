"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  distinctFiscalYears,
  monthlyBurn,
  sumSgd,
  vendorSummaries,
} from "@/lib/finance/aggregates";
import {
  fmtDate,
  fmtSgd,
  fiscalYearFromDate,
  fiscalYearLabel,
  statusLabel,
} from "@/lib/finance/format";
import type { FinanceExpenseRow, FinanceVendorRow } from "@/lib/finance/types";

export function FinanceDashboard() {
  const { supabase, session, signOut } = useInternalAuth();
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [vendors, setVendors] = useState<FinanceVendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fyFilter, setFyFilter] = useState<number>(() => fiscalYearFromDate());
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [expResult, vendorResult] = await Promise.all([
      supabase
        .from("finance_expenses")
        .select(
          "id, transaction_date, vendor_name, description, original_amount, original_currency, amount_sgd, status, fiscal_year, fiscal_quarter, fiscal_month, category_slug, source"
        )
        .order("transaction_date", { ascending: false })
        .limit(1000),
      supabase.from("finance_vendors").select("slug, name").order("name"),
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

  const totalSgd = sumSgd(filteredRows);
  const needsReview = filteredRows.filter((r) => r.status === "needs_review").length;
  const vendorsInFy = vendorSummaries(fyRows);
  const burn = monthlyBurn(filteredRows);
  const maxBurn = Math.max(...burn.map((b) => b.totalSgd), 1);

  const vendorOptions = useMemo(() => {
    const fromRows = [...new Set(fyRows.map((r) => r.vendor_name))].sort();
    if (fromRows.length > 0) return fromRows;
    return vendors.map((v) => v.name);
  }, [fyRows, vendors]);

  const uncoveredVendors = vendors.filter(
    (v) => !expenses.some((e) => e.vendor_name === v.name)
  );

  return (
    <InternalChrome
      title="Finance"
      subtitle="StancePro Pte Ltd · SGD ledger"
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

        {/* FY tabs */}
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

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label={`${fiscalYearLabel(fyFilter)} spend`} value={`S$${fmtSgd(totalSgd)}`} />
          <SummaryCard label="Rows" value={String(filteredRows.length)} />
          <SummaryCard
            label="Needs review"
            value={String(needsReview)}
            accent={needsReview > 0 ? "amber" : undefined}
          />
          <SummaryCard label="Vendors with data" value={String(vendorsInFy.length)} />
        </div>

        {/* Filing readiness */}
        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">Filing readiness</h2>
          <p className="mt-1 text-sm text-slate-400">
            Oct–Sep fiscal year · presentation currency SGD · FX via transaction-date ECB rates
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
                : `· ${uncoveredVendors.length} vendor(s) with no data yet: ${uncoveredVendors
                    .slice(0, 5)
                    .map((v) => v.name)
                    .join(", ")}${uncoveredVendors.length > 5 ? "…" : ""}`}
            </li>
          </ul>
        </section>

        {/* Monthly burn */}
        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">Monthly burn (SGD)</h2>
          {burn.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No expenses in this filter.</p>
          ) : (
            <div className="mt-6 flex items-end gap-2 overflow-x-auto pb-2">
              {burn.map((month) => (
                <div key={month.key} className="flex min-w-[3rem] flex-col items-center gap-2">
                  <div
                    className="w-10 rounded-t-md bg-brand-500/80"
                    style={{ height: `${Math.max(8, (month.totalSgd / maxBurn) * 120)}px` }}
                    title={`S$${fmtSgd(month.totalSgd)}`}
                  />
                  <span className="text-[10px] text-slate-400">{month.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vendor breakdown */}
        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <h2 className="text-lg font-semibold text-white">By vendor</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Vendor</th>
                  <th className="pb-2 pr-4 text-right font-medium">Rows</th>
                  <th className="pb-2 pr-4 text-right font-medium">Total SGD</th>
                  <th className="pb-2 text-right font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {vendorsInFy.map((v) => (
                  <tr key={v.vendor} className="border-b border-white/5 text-slate-200">
                    <td className="py-2 pr-4">{v.vendor}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{v.rows}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">S${fmtSgd(v.totalSgd)}</td>
                    <td className="py-2 text-right tabular-nums">{v.needsReview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Filters + expense list */}
        <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Expenses</h2>
            <div className="flex flex-wrap gap-3">
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
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Vendor</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 text-right font-medium">Original</th>
                  <th className="pb-2 pr-3 text-right font-medium">SGD</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading expenses…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No expenses match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 text-slate-200">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(row.transaction_date)}</td>
                      <td className="py-2 pr-3">{row.vendor_name}</td>
                      <td className="max-w-xs truncate py-2 pr-3 text-slate-300">
                        {row.description || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                        {row.original_currency} {Number(row.original_amount).toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                        S${fmtSgd(row.amount_sgd)}
                      </td>
                      <td className="py-2">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </InternalChrome>
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

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "needs_review"
      ? "bg-amber-500/20 text-amber-200"
      : status === "approved"
        ? "bg-emerald-500/20 text-emerald-200"
        : "bg-slate-500/20 text-slate-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${styles}`}>
      {statusLabel(status)}
    </span>
  );
}
