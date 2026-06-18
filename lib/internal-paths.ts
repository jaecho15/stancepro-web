const INTERNAL_PREFIX = "/internal";

/** Only allow redirects within /internal (blocks open redirects). */
export function sanitizeInternalNext(
  next: string | null | undefined,
  fallback = "/internal"
): string {
  if (!next || !next.startsWith(INTERNAL_PREFIX)) return fallback;
  if (next.startsWith("//") || next.includes("://")) return fallback;
  return next;
}

export const INTERNAL_LOGIN_PATH = "/internal/login";
export const INTERNAL_AUTH_CALLBACK_PATH = "/internal/auth/callback";
