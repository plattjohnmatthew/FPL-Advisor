import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Research",
  description: "Personal Fantasy Premier League research application",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="brand" href="/" aria-label="FPL Research home"><span>FR</span> FPL Research</Link>
            <nav aria-label="Primary navigation">
              <Link href="/#intelligence">Intelligence</Link>
              <Link href="/#ask">Ask</Link>
              <Link href="/#content">Content</Link>
              <Link href="/entities">Explore</Link>
              <Link href="/settings">Settings</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
