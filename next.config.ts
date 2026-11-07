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
    ];
  },
};

export default nextConfig;
