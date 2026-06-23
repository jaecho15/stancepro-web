import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { FounderJournalViewer } from "@/components/internal/FounderJournalViewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founder Journal — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalFounderJournalPage() {
  return (
    <InternalGate loginNext="/internal/development-log/founder">
      <FounderJournalViewer />
    </InternalGate>
  );
}
