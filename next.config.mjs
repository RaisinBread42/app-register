/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@astryxdesign/core'],
  },
  // Hide the Next.js floating indicator so mockup screenshots stay clean.
  devIndicators: false,
};

export default nextConfig;
