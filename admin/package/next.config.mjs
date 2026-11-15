/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_DIST_DIR lets a production build live beside a running `next dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // Serve under a sub-path such as /admin: build with NEXT_PUBLIC_BASE_PATH=/admin (see docs/DEPLOY_CPANEL.md).
  basePath: (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '') || undefined,
  // Import only the icons and chart parts that are used instead of whole libraries (faster compile and smaller pages).
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: 'localhost' }] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
