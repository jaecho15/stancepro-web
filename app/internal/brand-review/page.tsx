import type { Metadata } from "next";
import { InternalGate } from "@/components/internal/InternalGate";
import { BrandReviewPortal } from "@/components/brand-review/BrandReviewPortal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brand Review — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalBrandReviewPage() {
  return (
    <InternalGate loginNext="/internal/brand-review">
      <BrandReviewPortal />
    </InternalGate>
  );
}
