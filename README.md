# Music Player with DJ Announcements

Radio-style music player với tính năng DJ giới thiệu bài hát bằng AI.

## Features

- 🎵 YouTube music playback
- 🎙️ AI-powered DJ announcements (Vietnamese TTS)
- 💬 Song dedication messages
- 👥 User voting system
- 📅 Scheduled playlists
- 🎯 Smart song/artist parsing with Gemini AI
- 🔐 User authentication & admin management
- ⚡ Real-time updates with Socket.io

## Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Database**: SQLite with Sequelize ORM
- **Frontend**: EJS, Bootstrap 5
- **Audio**: yt-dlp, Web Speech API
- **AI**: Google Gemini (song parsing & DJ scripts)
- **Deployment**: Docker, Docker Compose

## Quick Start with Docker

### Prerequisites
- Docker
- Docker Compose

### Deploy

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

Access at: **http://localhost:3000**

- Admin page: `/admin`
- Public page: `/`

## Environment Variables

Create `.env` file (copy from `.env.example`):

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite:./data/musicplayer.db
SESSION_SECRET=your-super-secret-key-change-this
LOG_LEVEL=info
GOOGLE_AI_API_KEY=your-gemini-api-key
```

## Production Deployment

### Auto-deploy via GitHub Actions

Push to `master` branch triggers automatic deployment:

1. **Setup GitHub Repository**
   ```bash
   git remote add origin https://github.com/your-username/music-player.git
   git push -u origin master
   ```

2. **Add GitHub Secret**
   - Go to: Repository Settings → Secrets and variables → Actions
   - Add `SSH_PRIVATE_KEY` (private key có quyền SSH vào server)

3. **Server Setup** (SSH vào server 103.148.57.174)
   ```bash
   # Clone repo
   cd /root
   git clone https://github.com/your-username/music-player.git
   cd music-player

   # Create .env với production values
   nano .env

   # First deploy
   docker-compose up -d --build
   ```

4. **Cloudflare DNS**
   - Add A record: `music-player.thammytrunganh.com` → `103.148.57.174`
   - Enable proxy (orange cloud)
   - SSL/TLS mode: Full

### Manual Deployment

```bash
ssh root@103.148.57.174
cd /root/music-player
git pull origin master
docker-compose up -d --build
docker system prune -f
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user info

### Songs
- `GET /api/songs/queue` - Queue with votes
- `GET /api/songs/recently-played` - Recently played
- `POST /api/songs/add` - Add song with YouTube URL & dedication
- `DELETE /api/songs/:id` - Delete song (admin)

### Playback
- `POST /api/playback/next` - Play next song (admin)
- `POST /api/playback/pause` - Pause (admin)
- `POST /api/playback/resume` - Resume (admin)
- `POST /api/playback/volume` - Set volume (admin)

### Votes
- `POST /api/votes/:song_id` - Toggle vote

## Socket.io Events

### Server → Client
- `play_announcement` - DJ announcement + song
- `play_song` - Song without announcement
- `queue_updated` - Queue changed
- `playback_paused` - Paused
- `playback_resumed` - Resumed
- `volume_changed` - Volume changed

## Project Structure

```
music-player/
├── routes/              # API endpoints
├── services/
│   ├── dj.js           # DJ announcement generator
│   ├── song-parser.js  # AI song title/artist parser
│   ├── youtube.js      # YouTube video info
│   └── gemini.js       # Gemini AI integration
├── models/             # Database models
├── views/
│   ├── admin.ejs       # Admin control panel
│   └── public.ejs      # Public voting page
├── public/             # Static assets
├── utils/              # Helpers & logger
├── data/               # SQLite database (auto-created)
└── .github/workflows/  # Auto-deployment
```

## Key Features

### DJ Announcements
- Gemini AI generates Vietnamese DJ intro text
- Web Speech API reads announcement with Vietnamese voice
- Music starts near end of announcement for smooth transition

### Smart Song Parser
- Gemini AI analyzes YouTube titles
- Correctly identifies song title vs artist name
- Handles Vietnamese formats: "Tên Bài - Ca Sĩ" or "CA SĨ - Tên Bài"
- Removes spam: (Official Video), [MV], hashtags, etc.

### Dedication Messages
- Users can add personal messages when requesting songs
- DJ reads dedication in announcement
- Shows in queue with heart icon

## License

MIT


<!-- Security scan triggered at 2026-09-05 07:21:36 -->