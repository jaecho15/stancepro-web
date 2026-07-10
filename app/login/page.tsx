import type { Metadata } from "next";
import { MemberLoginPage } from "@/components/auth/MemberLoginPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in | StancePro",
  robots: { index: false, follow: false },
};

export default function LoginRoute() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
      </div>
      <section className="relative container mx-auto px-6 pt-32 pb-24">
        <MemberLoginPage />
      </section>
    </div>
  );
}
