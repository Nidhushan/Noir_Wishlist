import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "img.anili.st",
      },
      {
        protocol: "https",
        hostname: "cdn.myanimelist.net",
      },
      {
        protocol: "https",
        hostname: "myanimelist.net",
      },
      {
        protocol: "https",
        hostname: "cdn.anime-planet.com",
      },
      {
        protocol: "https",
        hostname: "cdn.animenewsnetwork.com",
      },
      {
        protocol: "https",
        hostname: "cdn.anisearch.com",
      },
      {
        protocol: "https",
        hostname: "media.kitsu.app",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "simkl.in",
      },
      {
        protocol: "https",
        hostname: "u.livechart.me",
      },
      {
        protocol: "https",
        hostname: "cdn.anidb.net",
      },
    ],
  },
};

export default nextConfig;
