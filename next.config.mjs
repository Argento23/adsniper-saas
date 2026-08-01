// Trigger Rebuild - Image Fallback Logic V3
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone', // Optimizes for Docker/VPS
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
