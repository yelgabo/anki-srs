import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Enter your email. We create an account on first sign-in. No password — MVP.
        </p>
      </header>

      <SignInForm searchParamsPromise={searchParams} />
    </div>
  );
}

async function SignInForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string }>;
}) {
  const sp = await searchParamsPromise;

  async function action(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) redirect("/signin?error=missing");
    await signIn("credentials", {
      email,
      redirectTo: "/review",
    });
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="you@example.com"
        />
      </label>
      {sp.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not sign in. Try again.
        </p>
      )}
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Continue →
      </button>
    </form>
  );
}
