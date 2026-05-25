import Link from "next/link";
import { signinAction } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Email and password.
        </p>
      </header>

      {sp.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage(sp.error)}</p>
      )}

      <form action={signinAction} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Continue →
        </button>
      </form>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        No account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "rate_limited":
      return "Too many attempts. Try again in a few minutes.";
    default:
      return "Could not sign in.";
  }
}
