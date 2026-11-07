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
    ];
  },
};

export default nextConfig;
