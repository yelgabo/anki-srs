import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Geist_Mono } from "next/font/google";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0D14" },
    { media: "(prefers-color-scheme: light)", color: "#F4F5F7" },
  ],
};

export const metadata: Metadata = {
  title: "anki srs",
  description: "Spaced repetition for coding interview problems.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <main className="mx-auto max-w-wide px-4 sm:px-6 py-8 sm:py-12 md:py-16">
          {children}
        </main>
      </body>
    </html>
  );
}
