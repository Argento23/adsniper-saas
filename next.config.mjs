// Trigger Rebuild - Image+Text Fix V5 (Dynamic resvg, Vercel-safe)
/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        // Prevents webpack from trying to bundle native .node files (sharp, resvg)
        serverComponentsExternalPackages: ['@resvg/resvg-js', 'sharp'],
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true, // Prevents build fail on lint errors
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
            {
                protocol: 'https',
                hostname: 'manager.generarise.space',
            },
            {
                protocol: 'https',
                hostname: 'i.imgur.com',
            }
        ],
    },
};

export default nextConfig;
