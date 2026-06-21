"use client";

import type { DisplayCurrency, StackedMonthBurn } from "@/lib/finance/types";
import { fmtMoney } from "@/lib/finance/format";

function convertAmount(
  amountSgd: number,
  monthKey: string,
  currency: DisplayCurrency,
  nzdRates: Map<string, number>
): number {
  if (currency === "SGD") return amountSgd;
  const rate = nzdRates.get(monthKey) ?? nzdRates.get(`${monthKey}-01`);
  return rate ? amountSgd * rate : amountSgd;
}

export function StackedBurnChart({
  months,
  currency,
  nzdRates,
}: {
  months: StackedMonthBurn[];
  currency: DisplayCurrency;
  nzdRates: Map<string, number>;
}) {
  if (months.length === 0) {
    return <p className="mt-4 text-sm text-slate-400">No expenses in this filter.</p>;
  }

  const displayTotals = months.map((m) =>
    convertAmount(m.totalSgd, m.key, currency, nzdRates)
  );
  const maxTotal = Math.max(...displayTotals, 1);

  const legendVendors = [...new Set(months.flatMap((m) => m.segments.map((s) => s.vendor)))].slice(
    0,
    10
  );

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {months.map((month, idx) => {
          const colTotal = displayTotals[idx];
          const colHeight = Math.max(8, (colTotal / maxTotal) * 140);
          return (
            <div key={month.key} className="flex min-w-[2.75rem] flex-col items-center gap-2">
              <div
                className="flex w-10 flex-col-reverse overflow-hidden rounded-t-md border border-white/5"
                style={{ height: `${colHeight}px` }}
                title={fmtMoney(month.totalSgd, currency, nzdRates.get(month.key))}
              >
                {month.segments.map((seg) => {
                  const segDisplay = convertAmount(seg.amountSgd, month.key, currency, nzdRates);
                  const h = colTotal > 0 ? (segDisplay / colTotal) * colHeight : 0;
                  return (
                    <div
                      key={`${month.key}-${seg.vendor}`}
                      style={{
                        height: `${Math.max(h, seg.amountSgd > 0 ? 2 : 0)}px`,
                        backgroundColor: seg.color,
                      }}
                      title={`${seg.vendor}: ${fmtMoney(seg.amountSgd, currency, nzdRates.get(month.key))}`}
                    />
                  );
                })}
              </div>
              <span className="text-[10px] text-slate-400">{month.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {legendVendors.map((vendor) => {
          const color =
            months.flatMap((m) => m.segments).find((s) => s.vendor === vendor)?.color ??
            "#64748b";
          return (
            <span key={vendor} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {vendor}
            </span>
          );
        })}
      </div>
    </div>
  );
}
