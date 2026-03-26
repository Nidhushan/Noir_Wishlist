import type { Metadata } from "next";
import Link from "next/link";

import { TopbarAuth } from "@/components/topbar-auth";

import "./globals.css";

export const dynamic = "force-dynamic";

const metadataBase = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : new URL("http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Noir",
    template: "%s | Noir",
  },
  description:
    "Discover trending anime, search the AniList catalog, and explore detailed anime metadata.",
  applicationName: "Noir",
  openGraph: {
    title: "Noir",
    description:
      "Discover trending anime, search the AniList catalog, and explore detailed anime metadata.",
    siteName: "Noir",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noir",
    description:
      "Discover trending anime, search the AniList catalog, and explore detailed anime metadata.",
  },
};

export default async function RootLayout({
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
              <p className="topbarCopy">AniList-powered anime discovery, rendered server-side.</p>
            </div>
            <TopbarAuth />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
