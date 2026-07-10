import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isGatedPath, MEMBER_LOGIN_PATH } from "@/lib/member-auth";

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
  if (!user && isGatedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = MEMBER_LOGIN_PATH;
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
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
  ],
};
