export type FinanceReceiptRow = {
  id: string;
  expense_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  source_reference: string | null;
};

export type FinanceExpenseRow = {
  id: string;
  transaction_date: string;
  vendor_name: string;
  description: string | null;
  original_amount: number;
  original_currency: string;
  amount_sgd: number | null;
  status: string;
  fiscal_year: number;
  fiscal_quarter: number;
  fiscal_month: number;
  category_slug: string | null;
  source: string;
  notes: string | null;
  receipt_storage_path: string | null;
  primary_receipt_id: string | null;
  audit_locked_at: string | null;
  external_id: string | null;
};

export type DisplayCurrency = "SGD" | "NZD";

export type FinanceVendorRow = {
  slug: string;
  name: string;
};

export type VendorSummary = {
  vendor: string;
  rows: number;
  totalSgd: number;
  needsReview: number;
};

export type MonthBurn = {
  key: string;
  label: string;
  totalSgd: number;
};

export type StackedBurnSegment = {
  vendor: string;
  amountSgd: number;
  color: string;
};

export type StackedMonthBurn = {
  key: string;
  label: string;
  totalSgd: number;
  segments: StackedBurnSegment[];
};
