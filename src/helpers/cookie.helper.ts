/**
 * src/helpers/cookie.helper.ts
 * Utility functions for parsing Cookie headers and extracting session tokens.
 */

/**
 * Safely parses a raw HTTP Cookie header string into a key-value dictionary.
 */
export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const separatorIdx = trimmed.indexOf("=");
    if (separatorIdx === -1) return acc;

    const key = trimmed.slice(0, separatorIdx).trim();
    const val = trimmed.slice(separatorIdx + 1).trim();

    if (key) {
      try {
        acc[key] = decodeURIComponent(val);
      } catch {
        acc[key] = val;
      }
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Extracts the session authentication token from request cookies or raw Cookie header.
 * Prioritizes Clerk's standard "__session" cookie, followed by general session/token cookies.
 */
export function getAuthTokenFromCookies(
  cookies?: Record<string, string>,
  cookieHeader?: string
): string | undefined {
  const merged = {
    ...parseCookieHeader(cookieHeader),
    ...(cookies || {}),
  };

  return (
    merged.__session ||
    merged.session ||
    merged.token ||
    merged.jwt ||
    merged.session_token
  );
}
