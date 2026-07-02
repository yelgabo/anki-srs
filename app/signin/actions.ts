"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";

const SigninFormSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

export async function signinAction(formData: FormData) {
  const parsed = SigninFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/signin?error=invalid_credentials");

  const { email, password } = parsed.data;

  // Rate limiting is enforced downstream in lib/auth.ts `authorize` (the single
  // source of truth: signIn() routes through it, as does the direct
  // /api/auth/callback/credentials path). Doing it here too would double-count
  // the per-email bucket and lock a legit user out after ~2 attempts, surfacing
  // as a misleading "invalid_credentials". A tripped limiter in authorize
  // returns null → caught below as AuthError → invalid_credentials.
  try {
    await signIn("credentials", { email, password, redirectTo: "/review" });
  } catch (err) {
    // NEXT_REDIRECT is how Next signals a successful redirect — rethrow it.
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError) redirect("/signin?error=invalid_credentials");
    throw err;
  }
}
