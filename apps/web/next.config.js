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

  // L'API Fastify tourne ailleurs (Railway). On l'expose sous
  // taskpilot.cc/api plutôt que sur un sous-domaine api.* : pas
  // d'enregistrement DNS à créer, et le navigateur reste en same-origin,
  // donc plus de préflight CORS pour l'extension et le dashboard.
  //
  // Tant que API_UPSTREAM n'est pas défini, aucune règle n'est émise et le
  // site se comporte exactement comme avant.
  async rewrites() {
    const upstream = process.env.API_UPSTREAM?.replace(/\/+$/, '')
    if (!upstream) return []
    return [{ source: '/api/:path*', destination: `${upstream}/:path*` }]
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
