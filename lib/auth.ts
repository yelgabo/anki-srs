import { createHash } from "node:crypto";
import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verify, KNOWN_BAD_HASH } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const SigninSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

const SEVEN_DAYS = 60 * 60 * 24 * 7;
const FIVE_MIN = 5 * 60 * 1000;

// Non-reversible, non-enumerable identifier for the forensic log. Never log the
// raw email (PII) — a short SHA-256 fingerprint is enough to correlate attempts.
function emailFingerprint(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt", maxAge: SEVEN_DAYS },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = SigninSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Rate limiting lives HERE — the single source of truth for BOTH entry
        // paths. NextAuth exposes POST /api/auth/callback/credentials directly
        // (bypassing the signinAction wrapper), and signIn() from the form
        // routes THROUGH this callback, so the limiter must sit here to cover
        // both without double-counting. Per-email (5/5min) is the credential-
        // stuffing defense; per-IP (20/5min) is the spray defense. `headers()`
        // is valid here: authorize runs in the credentials route-handler (Node
        // runtime, server-side request context).
        const ip = getClientIp(await headers());
        const ipLimit = rateLimit({ key: `signin:ip:${ip}`, limit: 20, windowMs: FIVE_MIN });
        const emailLimit = rateLimit({ key: `signin:email:${email}`, limit: 5, windowMs: FIVE_MIN });
        if (!ipLimit.ok || !emailLimit.ok) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // Always run verify with a real hash (KNOWN_BAD_HASH when user is
        // absent) so timing is equal whether or not the email exists.
        const ok = await verify(password, user?.passwordHash ?? KNOWN_BAD_HASH);

        // Forensic trail. Never log the password, hash, or raw email (PII).
        console.log(
          JSON.stringify({
            event: "signin_attempt",
            emailHash: emailFingerprint(email),
            success: !!user && ok,
            ts: Date.now(),
          }),
        );

        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
  pages: { signIn: "/signin" },
});
