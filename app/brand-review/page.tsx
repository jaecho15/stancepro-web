import { redirect } from "next/navigation";

export default function LegacyBrandReviewRedirect() {
  redirect("/internal/brand-review");
}
