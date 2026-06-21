"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Paperclip, Trash2 } from "lucide-react";
import { fetchFxRate } from "@/lib/finance/fx";
import { fmtDate, fmtMoney, statusLabel } from "@/lib/finance/format";
import { sha256Hex } from "@/lib/finance/receipts";
import type {
  DisplayCurrency,
  FinanceExpenseRow,
  FinanceReceiptRow,
} from "@/lib/finance/types";

type ExpenseSectionProps = {
  supabase: SupabaseClient;
  userEmail: string | undefined;
  rows: FinanceExpenseRow[];
  receiptsByExpense: Map<string, FinanceReceiptRow[]>;
  signedUrls: Map<string, string>;
  vendorOptions: string[];
  currency: DisplayCurrency;
  nzdRates: Map<string, number>;
  loading: boolean;
  onRefresh: () => void;
};

const EMPTY_FORM = {
  transaction_date: new Date().toISOString().slice(0, 10),
  vendor_name: "",
  description: "",
  original_amount: "",
  original_currency: "USD",
};

export function ExpenseSection({
  supabase,
  userEmail,
  rows,
  receiptsByExpense,
  signedUrls,
  vendorOptions,
  currency,
  nzdRates,
  loading,
  onRefresh,
}: ExpenseSectionProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const vendorList = useMemo(() => {
    const set = new Set([...vendorOptions, ...rows.map((r) => r.vendor_name)]);
    return [...set].filter(Boolean).sort();
  }, [vendorOptions, rows]);

  const nzdRateForRow = (row: FinanceExpenseRow) => nzdRates.get(row.transaction_date);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const amount = Number(form.original_amount);
    if (!form.vendor_name.trim() || !form.transaction_date || !Number.isFinite(amount) || amount <= 0) {
      setActionError("Vendor, date, and a positive amount are required.");
      return;
    }
    setSaving(true);
    try {
      const currencyCode = form.original_currency.toUpperCase();
      let amountSgd = amount;
      let fxRate = 1;
      let fxDate = form.transaction_date;
      let fxSource = "identity";
      if (currencyCode !== "SGD") {
        const fx = await fetchFxRate(form.transaction_date, currencyCode, "SGD");
        fxRate = fx.rate;
        fxDate = fx.date;
        fxSource = fx.source;
        amountSgd = amount * fx.rate;
      }
      const { error } = await supabase.from("finance_expenses").insert({
        source: "manual_ui",
        vendor_name: form.vendor_name.trim(),
        transaction_date: form.transaction_date,
        description: form.description.trim() || null,
        original_amount: amount,
        original_currency: currencyCode,
        amount_sgd: amountSgd,
        fx_rate_to_sgd: fxRate,
        fx_rate_source: fxSource,
        fx_rate_date: fxDate,
        status: "needs_review",
        ingested_by: userEmail ?? "manual_ui",
        recurring: false,
      });
      if (error) throw error;
      setForm(EMPTY_FORM);
      setShowAdd(false);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add row");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FinanceExpenseRow) => {
    if (row.audit_locked_at) {
      setActionError("This row is filing-locked and cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete ${row.vendor_name} ${row.transaction_date} (${row.description || "expense"})?`)) {
      return;
    }
    setActionError(null);
    const { error } = await supabase.from("finance_expenses").delete().eq("id", row.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    onRefresh();
  };

  const handleUpload = async (row: FinanceExpenseRow, file: File) => {
    setUploadingId(row.id);
    setActionError(null);
    try {
      const path = `${row.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("finance-receipts")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const hash = await sha256Hex(file);
      const { data: receipt, error: recErr } = await supabase
        .from("finance_receipts")
        .insert({
          expense_id: row.id,
          storage_path: path,
          sha256: hash,
          source: "manual_upload",
          original_filename: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          captured_by: userEmail ?? null,
        })
        .select("id")
        .single();
      if (recErr) throw recErr;

      const { error: linkErr } = await supabase
        .from("finance_expenses")
        .update({
          primary_receipt_id: receipt.id,
          receipt_storage_path: path,
        })
        .eq("id", row.id);
      if (linkErr) throw linkErr;
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Expenses</h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          {showAdd ? "Cancel" : "Add row"}
        </button>
      </div>

      {actionError ? (
        <p className="mt-3 text-sm text-red-400">{actionError}</p>
      ) : null}

      {showAdd ? (
        <form onSubmit={handleAdd} className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#0f1c40]/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date">
            <input
              type="date"
              required
              value={form.transaction_date}
              onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Vendor">
            <input
              list="vendor-names"
              required
              value={form.vendor_name}
              onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
              className={inputClass}
              placeholder="Cursor"
            />
            <datalist id="vendor-names">
              {vendorList.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
          <Field label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.original_amount}
              onChange={(e) => setForm((f) => ({ ...f, original_amount: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Currency">
            <select
              value={form.original_currency}
              onChange={(e) => setForm((f) => ({ ...f, original_currency: e.target.value }))}
              className={inputClass}
            >
              {["USD", "SGD", "NZD", "EUR", "GBP", "AUD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save expense"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="pb-2 pr-3 font-medium">Date</th>
              <th className="pb-2 pr-3 font-medium">Vendor</th>
              <th className="pb-2 pr-3 font-medium">Description</th>
              <th className="pb-2 pr-3 text-right font-medium">Original</th>
              <th className="pb-2 pr-3 text-right font-medium">{currency}</th>
              <th className="pb-2 pr-3 font-medium">Invoice</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Loading expenses…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No expenses match this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ExpenseRow
                  key={row.id}
                  row={row}
                  currency={currency}
                  nzdRate={nzdRateForRow(row)}
                  receipts={receiptsByExpense.get(row.id) ?? []}
                  signedUrls={signedUrls}
                  uploading={uploadingId === row.id}
                  onDelete={() => void handleDelete(row)}
                  onUpload={(file) => void handleUpload(row, file)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExpenseRow({
  row,
  currency,
  nzdRate,
  receipts,
  signedUrls,
  uploading,
  onDelete,
  onUpload,
}: {
  row: FinanceExpenseRow;
  currency: DisplayCurrency;
  nzdRate?: number;
  receipts: FinanceReceiptRow[];
  signedUrls: Map<string, string>;
  uploading: boolean;
  onDelete: () => void;
  onUpload: (file: File) => void;
}) {
  const storagePath =
    row.receipt_storage_path ?? receipts[0]?.storage_path ?? null;
  const storageUrl = storagePath ? signedUrls.get(storagePath) : null;

  return (
    <tr className="border-b border-white/5 text-slate-200">
      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(row.transaction_date)}</td>
      <td className="py-2 pr-3">{row.vendor_name}</td>
      <td className="max-w-[12rem] truncate py-2 pr-3 text-slate-300" title={row.description ?? ""}>
        {row.description || "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
        {row.original_currency} {Number(row.original_amount).toFixed(2)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
        {fmtMoney(row.amount_sgd, currency, nzdRate)}
      </td>
      <td className="py-2 pr-3">
        <div className="flex flex-wrap items-center gap-2">
          {storageUrl ? (
            <a
              href={storageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Invoice
            </a>
          ) : (
            <span className="text-xs text-slate-500">No invoice</span>
          )}
          {!row.audit_locked_at ? (
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-white">
              <Paperclip className="h-3.5 w-3.5" />
              {uploading ? "…" : "Upload"}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      </td>
      <td className="py-2 pr-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="py-2">
        {!row.audit_locked_at ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
            title="Delete row"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-[10px] text-slate-500" title="Filing locked">
            🔒
          </span>
        )}
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none";

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
