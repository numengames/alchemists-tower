/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output: produces a self-contained .next/standalone folder
  // (server.js + minimal node_modules) ready to drop into a tiny Docker image.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
