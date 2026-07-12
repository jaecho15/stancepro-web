import { redirect } from "next/navigation";

// The seasonal outlook is now integrated into the unified snow browser at
// /snow-forecast (region level = seasonal, resort level = 16-day forecast).
export default function SnowOutlookPage() {
  redirect("/snow-forecast");
}
