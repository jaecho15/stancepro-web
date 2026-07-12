import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { BackfillDashboard } from "@/components/backfill/BackfillDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terrain Backfill — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalBackfillPage() {
  return (
    <InternalGate loginNext="/internal/backfill">
      <BackfillDashboard />
    </InternalGate>
  );
}
