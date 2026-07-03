/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // Experimental features
  experimental: {
    serverComponentsExternalPackages: [
      '@supabase/supabase-js',
      '@supabase/auth-helpers-nextjs',
      '@supabase/auth-helpers-shared',
    ],
  },

  // Webpack config for monorepo
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    }
    return config
  },

  // Security headers (also set in middleware.ts)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/app',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
