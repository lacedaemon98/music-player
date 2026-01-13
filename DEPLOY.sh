#!/bin/bash
# Quick deploy script - Run this on your server

echo "=== Music Player Quick Deploy ==="
echo ""

# Check if in correct directory
if [ ! -d "/root/music-player" ]; then
    echo "Cloning repository..."
    cd /root
    git clone https://github.com/lacedaemon98/music-player.git
    cd music-player
else
    echo "Repository exists, pulling latest..."
    cd /root/music-player
    git pull origin master
fi

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite:./data/musicplayer.db
SESSION_SECRET=music-player-production-secret-key-$(openssl rand -hex 32)
LOG_LEVEL=info
GOOGLE_AI_API_KEY=AIzaSyDxH9vK8qYyXhLx_CHANGE_THIS
EOF
    echo "✓ .env created - Remember to update GOOGLE_AI_API_KEY!"
else
    echo "✓ .env already exists"
fi

# Create data directory
mkdir -p data

# Deploy
echo ""
echo "Deploying with Docker..."
docker-compose up -d --build

echo ""
echo "Waiting for container to start..."
sleep 5

# Show status
echo ""
echo "=== Status ==="
docker-compose ps

echo ""
echo "=== Recent Logs ==="
docker logs music-player --tail 20

echo ""
echo "=== Deploy Complete! ==="
echo "URL: http://music-player.thammytrunganh.com"
echo ""
echo "Useful commands:"
echo "  View logs:    docker logs music-player -f"
echo "  Restart:      docker-compose restart"
echo "  Stop:         docker-compose down"
echo "  Update code:  git pull origin master && docker-compose up -d --build"
