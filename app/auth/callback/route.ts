import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_LOGIN_PATH, sanitizeMemberNext } from "@/lib/member-auth";

// OAuth / magic-link callback for member sign-in (mirrors internal/auth/callback).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeMemberNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(
    `${origin}${MEMBER_LOGIN_PATH}?error=auth&next=${encodeURIComponent(next)}`
  );
}
