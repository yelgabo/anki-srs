// Server-side helper for reading the m2_skip cookie. Not a server action —
// this file is imported by server components (e.g., /review/page.tsx).

import { cookies } from "next/headers";
import { verify } from "./signed-cookie";

export const SKIP_COOKIE = "m2_skip";

export async function readSkipCookie(userId: string): Promise<string[]> {
  const jar = await cookies();
  const payload = verify(jar.get(SKIP_COOKIE)?.value);
  if (!payload || payload.userId !== userId) return [];
  return payload.ids;
}
