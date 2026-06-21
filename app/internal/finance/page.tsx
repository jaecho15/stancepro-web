import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { FinanceGate } from "@/components/finance/FinanceGate";
import { FinanceDashboard } from "@/components/finance/FinanceDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finance — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalFinancePage() {
  return (
    <InternalGate loginNext="/internal/finance">
      <FinanceGate>
        <FinanceDashboard />
      </FinanceGate>
    </InternalGate>
  );
}
