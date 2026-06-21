import type {
  FinanceExpenseRow,
  MonthBurn,
  StackedMonthBurn,
  VendorSummary,
} from "@/lib/finance/types";

export function sumSgd(rows: FinanceExpenseRow[]): number {
  return rows.reduce((acc, row) => acc + Number(row.amount_sgd || 0), 0);
}

export function vendorSummaries(rows: FinanceExpenseRow[]): VendorSummary[] {
  const map = new Map<string, VendorSummary>();
  for (const row of rows) {
    const vendor = row.vendor_name || "(unknown)";
    const entry = map.get(vendor) ?? {
      vendor,
      rows: 0,
      totalSgd: 0,
      needsReview: 0,
    };
    entry.rows += 1;
    entry.totalSgd += Number(row.amount_sgd || 0);
    if (row.status === "needs_review") entry.needsReview += 1;
    map.set(vendor, entry);
  }
  return [...map.values()].sort((a, b) => b.totalSgd - a.totalSgd);
}

export function monthlyBurn(rows: FinanceExpenseRow[]): MonthBurn[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.transaction_date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + Number(row.amount_sgd || 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, totalSgd]) => ({
      key,
      label: formatMonthLabel(key),
      totalSgd,
    }));
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-SG", { month: "short", year: "2-digit" });
}

export function distinctFiscalYears(rows: FinanceExpenseRow[]): number[] {
  return [...new Set(rows.map((r) => r.fiscal_year))].sort((a, b) => b - a);
}

export function stackedMonthlyBurnByVendor(
  rows: FinanceExpenseRow[],
  vendorColors: Map<string, string>
): StackedMonthBurn[] {
  const monthMap = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const month = row.transaction_date.slice(0, 7);
    const vendor = row.vendor_name || "(unknown)";
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    const seg = monthMap.get(month)!;
    seg.set(vendor, (seg.get(vendor) ?? 0) + Number(row.amount_sgd || 0));
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, segs]) => {
      const segments = [...segs.entries()]
        .map(([vendor, amountSgd]) => ({
          vendor,
          amountSgd,
          color: vendorColors.get(vendor) ?? "#64748b",
        }))
        .sort((a, b) => b.amountSgd - a.amountSgd);
      return {
        key,
        label: formatMonthLabel(key),
        totalSgd: segments.reduce((acc, s) => acc + s.amountSgd, 0),
        segments,
      };
    });
}
