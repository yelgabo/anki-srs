import Link from "next/link";
import { signinAction } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-column space-y-8">
      <header className="space-y-3">
        <Link href="/" className="label hover:text-accent transition-colors">
          ← anki / srs
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Sign in</h1>
      </header>

      {sp.error && <ErrorBanner code={sp.error} />}

      <form action={signinAction} className="space-y-5">
        <Field name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <Field name="password" label="Password" type="password" autoComplete="current-password" maxLength={128} />

        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
        >
          Continue
        </button>
      </form>

      <p className="text-sm text-fg-3">
        No account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

function Field({
  name,
  label,
  type,
  autoComplete,
  autoFocus,
  maxLength,
  minLength,
  hint,
}: {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
  autoFocus?: boolean;
  maxLength?: number;
  minLength?: number;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        maxLength={maxLength}
        minLength={minLength}
        className="block h-12 w-full rounded-lg border border-border bg-surface px-4 text-fg placeholder:text-fg-4 focus:border-accent focus:outline-none transition-colors"
      />
      {hint && <span className="block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

function ErrorBanner({ code }: { code: string }) {
  const message =
    code === "invalid_credentials"
      ? "Invalid email or password."
      : code === "rate_limited"
      ? "Too many attempts. Try again in a few minutes."
      : "Could not sign in.";
  return (
    <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
