import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { DevelopmentLogViewer } from "@/components/internal/DevelopmentLogViewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Development Log — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalDevelopmentLogPage() {
  return (
    <InternalGate loginNext="/internal/development-log">
      <DevelopmentLogViewer />
    </InternalGate>
  );
}
