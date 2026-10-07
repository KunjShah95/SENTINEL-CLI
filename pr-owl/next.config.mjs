/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PR Owl imports Sentinel's agent directly from the repository root, which is
  // outside this app's directory. Next needs to be told that is intentional or
  // it refuses to compile the import as external.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
