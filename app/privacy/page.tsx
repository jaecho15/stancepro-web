import { redirect } from "next/navigation";

// Backward-compatible route: /privacy → /privacy-policy
export default function PrivacyRedirectPage() {
  redirect("/privacy-policy");
}

