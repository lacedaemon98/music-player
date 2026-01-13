#!/bin/bash
# Setup script for music-player on production server
# Run this on server: bash setup-server.sh

set -e

echo "=== Music Player Server Setup ==="
echo ""

# Navigate to app directory
cd /root/music-player

# Create .env file
echo "Creating .env file..."
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite:./data/musicplayer.db
SESSION_SECRET=music-player-secret-key-$(date +%s)-random
LOG_LEVEL=info
GOOGLE_AI_API_KEY=AIzaSyDxH9vK8qYyXhLx_change_this_to_your_key
EOF

echo "✓ .env file created"
echo ""

# Create data directory
echo "Creating data directory..."
mkdir -p data
chmod 755 data

echo "✓ Data directory created"
echo ""

# Pull latest code
echo "Pulling latest code..."
git status
git reset --hard
git pull origin master

echo "✓ Code pulled"
echo ""

# Build and deploy
echo "Building and deploying Docker containers..."
docker-compose up -d --build

echo ""
echo "Waiting for containers to start..."
sleep 5

# Check status
echo ""
echo "=== Container Status ==="
docker-compose ps

echo ""
echo "=== Application Logs (last 20 lines) ==="
docker logs music-player --tail 20

echo ""
echo "=== Setup Complete ==="
echo "Application should be running at: http://103.148.57.174:3000"
echo "Domain: http://music-player.thammytrunganh.com"
echo ""
echo "To view live logs: docker logs music-player -f"
echo "To restart: docker-compose restart"
echo "To stop: docker-compose down"
