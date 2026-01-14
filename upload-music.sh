#!/bin/bash

# Script to upload offline music to production server
# Usage: ./upload-music.sh path/to/music.mp3

set -e

# Configuration
PRODUCTION_HOST="103.148.57.174"
PRODUCTION_USER="root"
SSH_KEY="$HOME/.ssh/id_rob_mac_mini_rsa"
REMOTE_MUSIC_DIR="/root/music-player/data/offline-music"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if file argument provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No music file specified${NC}"
    echo "Usage: $0 <music-file.mp3>"
    echo "Example: $0 ~/Downloads/song.mp3"
    exit 1
fi

MUSIC_FILE="$1"

# Check if file exists
if [ ! -f "$MUSIC_FILE" ]; then
    echo -e "${RED}Error: File not found: $MUSIC_FILE${NC}"
    exit 1
fi

# Check file extension
EXTENSION="${MUSIC_FILE##*.}"
if [[ ! "$EXTENSION" =~ ^(mp3|m4a|MP3|M4A)$ ]]; then
    echo -e "${YELLOW}Warning: File extension .$EXTENSION may not be supported. Recommended: .mp3 or .m4a${NC}"
fi

FILENAME=$(basename "$MUSIC_FILE")

echo -e "${GREEN}📤 Uploading music to production server...${NC}"
echo "File: $FILENAME"
echo "Size: $(du -h "$MUSIC_FILE" | cut -f1)"

# Create remote directory if not exists
echo -e "${GREEN}📁 Ensuring remote directory exists...${NC}"
ssh -i "$SSH_KEY" "$PRODUCTION_USER@$PRODUCTION_HOST" \
    "mkdir -p $REMOTE_MUSIC_DIR"

# Upload file
echo -e "${GREEN}🚀 Uploading file...${NC}"
scp -i "$SSH_KEY" "$MUSIC_FILE" \
    "$PRODUCTION_USER@$PRODUCTION_HOST:$REMOTE_MUSIC_DIR/$FILENAME"

# Verify upload
echo -e "${GREEN}✅ Verifying upload...${NC}"
ssh -i "$SSH_KEY" "$PRODUCTION_USER@$PRODUCTION_HOST" \
    "ls -lh $REMOTE_MUSIC_DIR/$FILENAME"

echo -e "${GREEN}✅ Upload completed successfully!${NC}"
echo ""
echo "File uploaded to: $REMOTE_MUSIC_DIR/$FILENAME"
echo ""
echo "To use this music:"
echo "1. Go to admin panel: http://103.148.57.174:3000/admin"
echo "2. The file will appear in the offline music library"
echo "3. Add it to the queue from there"
