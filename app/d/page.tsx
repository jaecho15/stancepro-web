import { headers } from "next/headers";
import { redirect } from "next/navigation";

const IOS_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL ??
  "https://apps.apple.com/app/id6744301646";
const ANDROID_URL =
  process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL ??
  "https://play.google.com/store/apps/details?id=com.stancepro";
const DESKTOP_FALLBACK = "/download";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function QRRedirect() {
  const ua = (await headers()).get("user-agent") ?? "";

  if (/iPhone|iPad|iPod/i.test(ua)) {
    redirect(IOS_URL);
  }
  if (/Android/i.test(ua)) {
    redirect(ANDROID_URL);
  }
  redirect(DESKTOP_FALLBACK);
}
