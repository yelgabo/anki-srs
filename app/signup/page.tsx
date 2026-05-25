import Link from "next/link";
import { signupAction } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-column space-y-8">
      <header className="space-y-3">
        <Link href="/" className="label hover:text-accent transition-colors">
          ← anki / srs
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Create account</h1>
      </header>

      <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
        No password reset in this MVP. Save your password somewhere safe.
      </p>

      {sp.error && <ErrorBanner code={sp.error} reason={sp.reason} />}

      <form action={signupAction} className="space-y-5">
        <Field name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          hint="≥10 chars, at least one number or symbol."
        />
        <Field
          name="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
        />

        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center rounded-lg bg-accent px-6 font-medium text-accent-fg hover:bg-accent-hover transition-colors"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-fg-3">
        Already have one?{" "}
        <Link href="/signin" className="text-accent hover:underline">
          Sign in
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

function ErrorBanner({ code, reason }: { code: string; reason?: string }) {
  const message =
    code === "invalid_input"
      ? "Please enter a valid email and password."
      : code === "mismatch"
      ? "Passwords don't match."
      : code === "weak"
      ? `Password too weak: ${reason ?? "use a stronger password"}.`
      : code === "rate_limited"
      ? "Too many signup attempts. Try again later."
      : "Could not create account.";
  return (
    <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
