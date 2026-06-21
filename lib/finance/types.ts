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
};

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
