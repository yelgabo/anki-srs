"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const SigninFormSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

const FIVE_MIN = 5 * 60 * 1000;

export async function signinAction(formData: FormData) {
  const parsed = SigninFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/signin?error=invalid_credentials");

  const { email, password } = parsed.data;

  // Per-IP AND per-email rate limit. Per-email is the credential-stuffing
  // defense; per-IP is the spray defense.
  const ip = getClientIp(await headers());
  const ipLimit = rateLimit({ key: `signin:ip:${ip}`, limit: 20, windowMs: FIVE_MIN });
  const emailLimit = rateLimit({ key: `signin:email:${email}`, limit: 5, windowMs: FIVE_MIN });
  if (!ipLimit.ok || !emailLimit.ok) redirect("/signin?error=rate_limited");

  try {
    await signIn("credentials", { email, password, redirectTo: "/review" });
  } catch (err) {
    // NEXT_REDIRECT is how Next signals a successful redirect — rethrow it.
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError) redirect("/signin?error=invalid_credentials");
    throw err;
  }
}
