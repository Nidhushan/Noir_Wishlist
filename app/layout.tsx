import type { Metadata } from "next";
import Link from "next/link";

import { TopbarAuth } from "@/components/topbar-auth";
import { getSiteUrl } from "@/lib/env";

import "./globals.css";

const metadataBase = new URL(getSiteUrl());

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Noir",
    template: "%s | Noir",
  },
  description:
    "Discover anime, build your watchlist, and keep your library organized with Noir.",
  applicationName: "Noir",
  openGraph: {
    title: "Noir",
    description:
      "Discover anime, build your watchlist, and keep your library organized with Noir.",
    siteName: "Noir",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noir",
    description:
      "Discover anime, build your watchlist, and keep your library organized with Noir.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="pageShell">
          <header className="topbar">
            <div className="topbarBrand">
              <Link className="brand" href="/">
                Noir
              </Link>
              <p className="topbarCopy">Your anime wishlist, organized.</p>
            </div>
            <TopbarAuth />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
