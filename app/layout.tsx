import { ShowcaseProvider } from "@/components/showcase-action-gate";
import { getShowcaseLinks } from "@/lib/showcase";
import { getAppCapabilities } from "@/lib/app-config";
import { CapabilityProvider } from "@/components/app-capabilities";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./foundation.css";

const geist = localFont({ src: "../public/fonts/geist-latin.woff2", variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "FPL Research",
  description: "Evidence-led Fantasy Premier League research: creator insights, briefings and player analysis.",
  openGraph: { title: "FPL Research", description: "Explore real FPL creator research, cited evidence and published briefings.", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={geist.variable}>
        <a className="skip-link" href="#app-content">Skip to content</a>
        <CapabilityProvider capabilities={getAppCapabilities()}><ShowcaseProvider links={getShowcaseLinks()}><AppShell links={getShowcaseLinks()}>{children}</AppShell></ShowcaseProvider></CapabilityProvider>
      </body>
    </html>
  );
}
