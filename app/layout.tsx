import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Research",
  description: "Personal Fantasy Premier League research application",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

