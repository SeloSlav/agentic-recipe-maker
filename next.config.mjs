import path from 'node:path';
/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: process.env.NEXT_BUILD_DIR || '.next',
    webpack(config, { isServer }) {
      // Keep the owner credential and database connection out of browser bundles.
      config.resolve.alias['local-data-request'] = path.resolve('app/lib/backend', isServer ? 'request.server.ts' : 'request.ts');
      return config;
    },
    experimental: {
        // Reduce layout chunk size; helps avoid ChunkLoadError timeout
        optimizePackageImports: [
            '@fortawesome/fontawesome-svg-core',
            '@fortawesome/react-fontawesome',
            '@fortawesome/free-solid-svg-icons',
        ],
    },
    async redirects() {
      return [
        { source: '/feed', destination: '/blog', permanent: true },
        { source: '/chat', destination: '/', permanent: true },
      ];
    },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'oaidalleapiprodscus.blob.core.windows.net',
        },
        {
          protocol: 'https',
          hostname: 'storage.googleapis.com',
        },
      ],
    },
  };

  export default nextConfig;

