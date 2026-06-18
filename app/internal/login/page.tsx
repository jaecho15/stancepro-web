import type { Metadata } from "next";
import { InternalLoginPage } from "@/components/internal/InternalLoginPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — StancePro Internal",
  robots: { index: false, follow: false },
};

export default function InternalLoginRoute() {
  return <InternalLoginPage />;
}
