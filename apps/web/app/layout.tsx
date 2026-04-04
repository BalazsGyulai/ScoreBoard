import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Load Geist fonts and expose them as CSS custom properties.
// These are consumed via var(--font-sans) / var(--font-mono) in globals.css.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HomeGame",
  description: "Játékos pontszámok és statisztikák",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="hu" — the UI is in Hungarian
    <html lang="hu">
      {/*
        The font variables are injected onto <body> so any CSS module
        can use them via var(--font-geist-sans) or var(--font-geist-mono).
        No Tailwind classes here — antialiasing is handled in globals.css.
      */}
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
