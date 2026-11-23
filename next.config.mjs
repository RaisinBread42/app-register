/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@astryxdesign/core'],
    // The dependency import sends a package-lock.json (up to DEPENDENCY_IMPORT_MAX_BYTES, 5 MB) through a server action.
    serverActions: {bodySizeLimit: '6mb'},
  },
};

export default nextConfig;
