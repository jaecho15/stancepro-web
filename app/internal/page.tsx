import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { InternalHub } from "@/components/internal/InternalHub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Internal — StancePro",
  robots: { index: false, follow: false },
};

export default function InternalHomePage() {
  return (
    <InternalGate loginNext="/internal">
      <InternalHub />
    </InternalGate>
  );
}
