export function fmtSgd(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtNzd(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString("en-NZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtMoney(
  amountSgd: number | null | undefined,
  currency: "SGD" | "NZD",
  nzdRate?: number
): string {
  if (currency === "SGD") return `S$${fmtSgd(amountSgd)}`;
  if (nzdRate == null) return "NZ$—";
  const nzd = Number(amountSgd || 0) * nzdRate;
  return `NZ$${fmtNzd(nzd)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Singapore FY label (Oct–Sep). e.g. FY2026 */
export function fiscalYearLabel(year: number): string {
  return `FY${year}`;
}

/** Calendar date → fiscal year int stored in DB */
export function fiscalYearFromDate(date = new Date()): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= 10 ? year + 1 : year;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "needs_review":
      return "Needs review";
    case "approved":
      return "Approved";
    case "ignored":
      return "Ignored";
    case "duplicate":
      return "Duplicate";
    default:
      return status;
  }
}
