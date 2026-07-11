// Login-gated member features (full-redirect gate, decided 2026-07-10).
// The middleware enforces these; the login page and auth callback share the
// same list so ?next= redirects can't become open redirects.

export const GATED_PREFIXES = [
  "/home",
  "/profile",
  "/calculator",
  "/snow-forecast",
  "/snow-outlook",
  "/resort-3d",
  "/resort",
] as const;

export const MEMBER_LOGIN_PATH = "/login";
export const MEMBER_AUTH_CALLBACK_PATH = "/auth/callback";
// Memoises "this user's profile row exists" so the middleware doesn't hit
// the profiles table on every gated request. Value = the user id it was
// verified for (guards against account switches on the same browser).
export const ONBOARDED_COOKIE = "sp-onboarded";

export function isGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Only allow post-login redirects into the gated features; a plain sign-in
 *  (no ?next) lands on the member hub. */
export function sanitizeMemberNext(
  next: string | null | undefined,
  fallback = "/home"
): string {
  if (!next) return fallback;
  if (next.startsWith("//") || next.includes("://")) return fallback;
  return isGatedPath(next) ? next : fallback;
}
