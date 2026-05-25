// Safe client IP extraction for use behind Railway's proxy.
//
// Threat: any HTTP client can set `X-Forwarded-For` to bypass an IP-based rate
// limit. Railway does NOT strip a client-supplied XFF — it appends. So a naive
// "leftmost XFF" read accepts spoofed values.
//
// Defense: trust XFF only when `x-real-ip` is also present (signal we're
// actually behind Railway's edge). Otherwise return "unknown" — degraded
// bucket is far better than a bypass.

export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  const xff = headers.get("x-forwarded-for");

  if (realIp && xff) {
    // Behind Railway proxy. Leftmost XFF entry is the original client.
    return xff.split(",")[0].trim() || realIp;
  }
  if (realIp) return realIp;

  // No proxy signal — don't trust client-supplied XFF.
  return "unknown";
}
