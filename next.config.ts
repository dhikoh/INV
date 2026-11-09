import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: '/api/v1/auth/:path*',
      },
      {
        source: '/session/:path*',
        destination: '/api/v1/session/:path*',
      },
      {
        source: '/business',
        destination: '/api/v1/business',
      },
      {
        source: '/businesses',
        destination: '/api/v1/businesses',
      },
      {
        source: '/users',
        destination: '/api/v1/users',
      },
      {
        source: '/users/:path*',
        destination: '/api/v1/users/:path*',
      },
      {
        source: '/downloads',
        destination: '/api/v1/downloads',
      },
      {
        source: '/dl/:token*',
        destination: '/api/v1/dl/:token*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://webk.telegram.org https://webz.telegram.org;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
