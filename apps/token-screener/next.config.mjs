/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile workspace packages from TypeScript source on every build —
  // prevents Vercel from serving stale cached artefacts when source changes.
  transpilePackages: ["@workspace/screener-core"],
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
