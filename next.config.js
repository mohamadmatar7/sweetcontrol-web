const nextConfig = {
  reactStrictMode: true,
  output: "export",

  experimental: {
    trustProxy: true,
    manualClientBasePath: true,
  },

  devIndicators: {
    appIsRunning: false,
  }
};

module.exports = nextConfig;
