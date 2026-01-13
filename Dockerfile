# Use Node.js 20 LTS Alpine
FROM node:20-alpine

# Install ffmpeg and yt-dlp (for YouTube audio extraction)
RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install --break-system-packages yt-dlp

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
