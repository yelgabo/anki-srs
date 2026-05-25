import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/today");
  const problemCount = await prisma.problem.count();

  return (
    <div className="space-y-10 sm:space-y-14">
      <header className="space-y-4">
        <p className="label">anki / srs</p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-[1.1] tracking-tight max-w-wide">
          Spaced repetition for{" "}
          <span className="text-accent">coding interview</span> problems.
        </h1>
        <p className="text-fg-2 text-base sm:text-lg max-w-column leading-relaxed">
          {problemCount} NeetCode problems, scheduled with SM-2. Daily streak with
          auto-freezes. Keyboard shortcuts. Works on your phone on the train.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/signup"
          className="flex h-12 items-center justify-center rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
        >
          Create account
        </Link>
        <Link
          href="/signin"
          className="flex h-12 items-center justify-center rounded-lg border border-border bg-surface px-6 font-medium text-fg hover:border-border-hi transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
