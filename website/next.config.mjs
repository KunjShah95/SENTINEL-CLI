/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Do not advertise the framework. Small win, but it is free.
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // The OG card is deterministic per query string, so it is safe to cache
        // hard at the edge and never re-render on a crawl.
        source: "/api/og",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/feed.xml",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=3600" }],
      },
      {
        source: "/llms.txt",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=3600" }],
      },
    ];
  },
};

export default nextConfig;
