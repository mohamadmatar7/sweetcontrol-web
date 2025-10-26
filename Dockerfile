# ======================================================
# SweetControl Web - Next.js + Nginx + Cloudflare Ready
# ======================================================

FROM node:18-alpine

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy all app source code
COPY . .

# ✅ Ensure next.config.js is present (even if missing locally)
# This makes the container future-proof against redirects or HTTPS proxy issues
RUN if [ ! -f next.config.js ]; then \
    echo '/** @type {import("next").NextConfig} */\n' \
         'const nextConfig = {\n' \
         '  reactStrictMode: true,\n' \
         '  output: "standalone",\n' \
         '  experimental: { trustProxy: true },\n' \
         '  async redirects() { return []; }\n' \
         '};\n' \
         'module.exports = nextConfig;' \
    > next.config.js; \
  fi

# Expose web server port
EXPOSE 3000

# Start Next.js
CMD ["npm", "run", "dev"]
