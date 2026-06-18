import type { Metadata } from "next";
import { BrandReviewPortal } from "@/components/brand-review/BrandReviewPortal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brand Review — StancePro",
  description: "Internal review for StancePro marketing assets.",
  robots: { index: false, follow: false },
};

export default function BrandReviewPage() {
  return <BrandReviewPortal />;
}
