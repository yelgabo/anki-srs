// Safe client IP extraction for use behind Railway's proxy.
//
// Threat: any HTTP client can set `X-Forwarded-For` to bypass an IP-based rate
// limit. Railway does NOT strip a client-supplied XFF — it APPENDS the real
// peer address as the last entry. So the LEFTMOST XFF entry is attacker-
// controlled and must never be trusted; only the rightmost / proxy-set values
// are.
//
// Defense: prefer Railway's own `x-real-ip` (set by the edge, not forgeable by
// the client). If it's absent, fall back to the RIGHTMOST XFF entry (the hop
// Railway appended). Otherwise return "unknown" — a degraded shared bucket is
// far better than a spoofable-per-request bypass.

export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    // Rightmost entry is the address the trusted proxy observed / appended;
    // leftmost entries are client-supplied and spoofable.
    if (parts.length > 0) return parts[parts.length - 1];
  }

  // No proxy signal — don't trust client-supplied XFF.
  return "unknown";
}
