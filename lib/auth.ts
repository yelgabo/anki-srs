import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";

// MVP auth: email-only, no password. The whole point is to test SRS retention,
// not to harden auth. Treat the deployed app as a personal tool until proven worth more.
const SigninSchema = z.object({
  email: z.string().email().max(254).toLowerCase().trim(),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(raw) {
        const parsed = SigninSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email } = parsed.data;

        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email },
        });

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
