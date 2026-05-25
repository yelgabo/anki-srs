import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verify, KNOWN_BAD_HASH } from "@/lib/password";

const SigninSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

const SEVEN_DAYS = 60 * 60 * 24 * 7;

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

        const user = await prisma.user.findUnique({ where: { email } });

        // Always run verify with a real hash (KNOWN_BAD_HASH when user is
        // absent) so timing is equal whether or not the email exists.
        const ok = await verify(password, user?.passwordHash ?? KNOWN_BAD_HASH);

        // Forensic trail. Never log the password or hash.
        console.log(
          JSON.stringify({
            event: "signin_attempt",
            email,
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
