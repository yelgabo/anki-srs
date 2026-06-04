"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { hash, validateStrength } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { createUserWithDefaultGroup } from "@/lib/groups";

const SignupSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
  confirm: z.string().min(1).max(128),
});

const HOUR = 60 * 60 * 1000;

export async function signupAction(formData: FormData) {
  const parsed = SignupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) redirect("/signup?error=invalid_input");

  const { email, password, confirm } = parsed.data;

  if (password !== confirm) redirect("/signup?error=mismatch");

  const strength = validateStrength(password);
  if (!strength.ok) {
    // Strength reasons are not enumeration — user is naming a new account.
    redirect(`/signup?error=weak&reason=${encodeURIComponent(strength.reason)}`);
  }

  // Rate-limit by IP (10/hour) and by email (3/hour) BEFORE any DB or hash work
  // so we never let an attacker drive us into expensive paths.
  const ip = getClientIp(await headers());
  const ipLimit = rateLimit({ key: `signup:ip:${ip}`, limit: 10, windowMs: HOUR });
  const emailLimit = rateLimit({ key: `signup:email:${email}`, limit: 3, windowMs: HOUR });
  if (!ipLimit.ok || !emailLimit.ok) redirect("/signup?error=rate_limited");

  // Hash BEFORE the create call. This equalizes timing between
  // "email available" and "email already taken" paths.
  const passwordHash = await hash(password);

  try {
    await createUserWithDefaultGroup(email, passwordHash);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Unique violation on email. Generic message — no enumeration.
      redirect("/signup?error=signup_failed");
    }
    throw err;
  }

  // Sign the new user in. This throws NEXT_REDIRECT on success.
  await signIn("credentials", { email, password, redirectTo: "/review" });
}
