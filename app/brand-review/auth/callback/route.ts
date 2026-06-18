import { NextResponse } from "next/server";

/** Legacy callback — forwards to shared internal auth handler. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/internal/auth/callback", url.origin);
  for (const [key, value] of url.searchParams.entries()) {
    target.searchParams.set(key, value);
  }
  if (!target.searchParams.has("next")) {
    target.searchParams.set("next", "/internal/brand-review");
  }
  return NextResponse.redirect(target);
}
