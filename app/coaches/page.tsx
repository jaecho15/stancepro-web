import type { Metadata } from "next";
import { CoachesContent } from "@/components/coaches/CoachesContent";

export const metadata: Metadata = {
  title: "Coach on StancePro - Apply, Get Approved, Start Coaching",
  description:
    "How coaching works on StancePro: what riders send you, how requests reach you, what the application asks for, and how sessions and payouts are handled.",
  alternates: { canonical: "/coaches" },
  openGraph: {
    title: "Coach on StancePro",
    description:
      "How coaching works on StancePro: applying, approval, running a session, and getting paid.",
    url: "https://stance-pro.com/coaches",
  },
};

export default function CoachesPage() {
  return <CoachesContent />;
}
