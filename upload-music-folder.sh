#!/bin/bash

# Script to upload entire folder of music to production server
# Usage: ./upload-music-folder.sh path/to/music-folder/

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

# Check if folder argument provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No folder specified${NC}"
    echo "Usage: $0 <music-folder>"
    echo "Example: $0 ~/Downloads/my-music/"
    exit 1
fi

MUSIC_FOLDER="$1"

# Check if folder exists
if [ ! -d "$MUSIC_FOLDER" ]; then
    echo -e "${RED}Error: Folder not found: $MUSIC_FOLDER${NC}"
    exit 1
fi

# Count music files
MUSIC_FILES=$(find "$MUSIC_FOLDER" -type f \( -iname "*.mp3" -o -iname "*.m4a" \) | wc -l)

if [ "$MUSIC_FILES" -eq 0 ]; then
    echo -e "${RED}Error: No music files (.mp3 or .m4a) found in $MUSIC_FOLDER${NC}"
    exit 1
fi

echo -e "${GREEN}📤 Uploading music folder to production server...${NC}"
echo "Folder: $MUSIC_FOLDER"
echo "Files found: $MUSIC_FILES music files"
echo ""

# Create remote directory if not exists
echo -e "${GREEN}📁 Ensuring remote directory exists...${NC}"
ssh -i "$SSH_KEY" "$PRODUCTION_USER@$PRODUCTION_HOST" \
    "mkdir -p $REMOTE_MUSIC_DIR"

# Upload entire folder with rsync for efficiency
echo -e "${GREEN}🚀 Uploading files with rsync...${NC}"
rsync -avz --progress \
    -e "ssh -i $SSH_KEY" \
    --include="*.mp3" --include="*.m4a" \
    --include="*.MP3" --include="*.M4A" \
    --exclude="*" \
    "$MUSIC_FOLDER/" \
    "$PRODUCTION_USER@$PRODUCTION_HOST:$REMOTE_MUSIC_DIR/"

# List uploaded files
echo -e "${GREEN}✅ Verifying upload...${NC}"
ssh -i "$SSH_KEY" "$PRODUCTION_USER@$PRODUCTION_HOST" \
    "ls -lh $REMOTE_MUSIC_DIR/ | tail -20"

echo ""
echo -e "${GREEN}✅ Upload completed successfully!${NC}"
echo ""
echo "Files uploaded to: $REMOTE_MUSIC_DIR/"
echo ""
echo "To use this music:"
echo "1. Go to admin panel: http://103.148.57.174:3000/admin"
echo "2. The files will appear in the offline music library"
echo "3. Add them to the queue from there"
