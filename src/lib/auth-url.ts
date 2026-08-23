const AUTH_URL_KEYS = [
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "provider_token",
  "provider_refresh_token",
  "token",
  "token_hash",
  "type",
  "code",
  "error",
  "error_code",
  "error_description",
] as const;

const AUTH_URL_MARKERS = [
  "access_token",
  "refresh_token",
  "token_hash",
  "code",
  "error_code",
] as const;

function hasAuthMarker(params: URLSearchParams) {
  return AUTH_URL_MARKERS.some((key) => params.has(key));
}

/**
 * Remove Supabase auth credentials/callback parameters from the visible URL.
 * MoonWords uses explicit email/password login, so an auth token found in a
 * copied URL must never be adopted as the viewer's login session.
 */
export function clearAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const hashParams = url.hash.startsWith("#") && url.hash.includes("=")
    ? new URLSearchParams(url.hash.slice(1))
    : null;
  const queryIsAuth = hasAuthMarker(url.searchParams);
  const hashIsAuth = hashParams ? hasAuthMarker(hashParams) : false;
  if (!queryIsAuth && !hashIsAuth) return;

  if (queryIsAuth) {
    for (const key of AUTH_URL_KEYS) url.searchParams.delete(key);
  }

  if (hashParams && hashIsAuth) {
    for (const key of AUTH_URL_KEYS) hashParams.delete(key);
    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, document.title, cleanUrl);
}
