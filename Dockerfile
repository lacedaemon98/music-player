# Use Node.js 20 LTS Alpine
FROM node:20-alpine

# Install ffmpeg, yt-dlp, and a JS runtime (for YouTube audio extraction)
RUN apk add --no-cache ffmpeg python3 py3-pip curl quickjs
# yt-dlp tracks YouTube's extractor changes, so a stale version breaks playback.
# Bump YTDLP_VERSION to pull a newer release.
ARG YTDLP_VERSION=2026.8.19
RUN pip3 install --break-system-packages --no-cache-dir --upgrade "yt-dlp==${YTDLP_VERSION}"
# YouTube's JS challenges need a JS runtime, and extraction without one is deprecated
# (formats go missing). yt-dlp only enables deno by default, but deno ships glibc-only
# builds that cannot run on musl, so enable quickjs instead for every yt-dlp call.
RUN printf -- '--js-runtimes quickjs\n' > /etc/yt-dlp.conf

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create data directory for SQLite and offline music
RUN mkdir -p /app/data /app/data/offline-music

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]
