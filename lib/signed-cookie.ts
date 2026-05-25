// HMAC-SHA256 signed cookies for ephemeral session-scoped state.
// AUTH_SECRET is the signing key; rotation invalidates all in-flight cookies (acceptable).

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SkipPayload {
  userId: string;
  ids: string[];
  iat: number;
}

function hmac(input: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function sign(payload: SkipPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verify(token: string | undefined | null): SkipPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SkipPayload;
    if (
      typeof parsed.userId !== "string" ||
      !Array.isArray(parsed.ids) ||
      typeof parsed.iat !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
