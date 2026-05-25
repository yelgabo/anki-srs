import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anki SRS for Coding Problems",
  description: "Spaced repetition for LeetCode and system design problems.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="mx-auto max-w-2xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
