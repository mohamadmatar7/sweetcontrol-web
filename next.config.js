/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    trustProxy: true,
  },
  devIndicators: {
    appIsRunning: false, 
  },
  async redirects() {
    return [];
  },
};

module.exports = nextConfig;
