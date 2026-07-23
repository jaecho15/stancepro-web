import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { PipelineMonitoring } from "@/components/internal/PipelineMonitoring";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pipeline Monitoring — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalMonitoringPage() {
  return (
    <InternalGate loginNext="/internal/monitoring">
      <PipelineMonitoring />
    </InternalGate>
  );
}
