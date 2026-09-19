/** @type {import('next').NextConfig} */

// Dev mode needs 'unsafe-eval' for Fast Refresh and 'unsafe-inline' for
// hydration markup. Production has neither requirement, so the stricter
// policy below applies once NODE_ENV=production.
const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://image.tmdb.org https://artworks.thetvdb.com https://*.thetvdb.com https://assets.fanart.tv https://*.fanart.tv",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  output: 'standalone',
  // Prevent Next from leaking the running version in the X-Powered-By header.
  poweredByHeader: false,
  // No experimental.instrumentationHook: the hook became stable in Next 15
  // and the flag was removed. src/instrumentation.ts is picked up by
  // filename alone, and Next 16 errors on the unknown key.

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
