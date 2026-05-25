import Link from "next/link";
import { signupAction } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Email and password. Both stored permanently.
        </p>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        ⚠ No password reset in this MVP. Save your password somewhere safe.
      </div>

      {sp.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {errorMessage(sp.error, sp.reason)}
        </p>
      )}

      <form action={signupAction} className="space-y-4">
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
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            At least 10 characters with one number or symbol.
          </span>
        </label>

        <label className="block">
          <span className="block text-sm font-medium">Confirm password</span>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Create account →
        </button>
      </form>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/signin" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function errorMessage(code: string, reason?: string): string {
  switch (code) {
    case "invalid_input":
      return "Please enter a valid email and password.";
    case "mismatch":
      return "Passwords don't match.";
    case "weak":
      return `Password is too weak: ${reason ?? "use a stronger password"}.`;
    case "rate_limited":
      return "Too many signup attempts. Try again later.";
    case "signup_failed":
      return "Could not create account.";
    default:
      return "Could not create account.";
  }
}
