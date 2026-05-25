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
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Anki SRS</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Spaced repetition for coding interview problems. {problemCount} problems seeded.
        </p>
      </header>

      <div className="flex gap-3">
        <Link
          href="/signin"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
