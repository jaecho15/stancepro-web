import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isGatedPath, MEMBER_LOGIN_PATH, ONBOARDED_COOKIE } from "@/lib/member-auth";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh the auth session cookie before gated/internal routes render.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Member features require a signed-in account (any StancePro user — same
  // Supabase auth as the app). Internal/brand-review enforcement stays in
  // those pages (membership checks), this middleware only refreshes them.
  const { pathname, search } = request.nextUrl;
  const isOnboarding = pathname === "/onboarding";
  if (!user && (isGatedPath(pathname) || isOnboarding)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = MEMBER_LOGIN_PATH;
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // First sign-in on the web must complete the same profile onboarding the
  // app has. A cookie scoped to the user id memoises "profile exists" so the
  // profiles lookup runs once per user, not on every gated request.
  if (user && isGatedPath(pathname)) {
    const memo = request.cookies.get(ONBOARDED_COOKIE)?.value;
    if (memo !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile) {
        const onboardingUrl = request.nextUrl.clone();
        onboardingUrl.pathname = "/onboarding";
        onboardingUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
        return NextResponse.redirect(onboardingUrl);
      }
      response.cookies.set(ONBOARDED_COOKIE, user.id, {
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/internal/:path*",
    "/brand-review/:path*",
    "/calculator/:path*",
    "/calculator",
    "/snow-forecast/:path*",
    "/snow-forecast",
    "/snow-outlook/:path*",
    "/snow-outlook",
    "/resort-3d/:path*",
    "/resort-3d",
    "/resort/:path*",
    "/home",
    "/onboarding",
  ],
};
