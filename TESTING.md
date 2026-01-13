# Music Player - Testing Guide

Your Music Player application is now **RUNNING** in Docker! 🎉

## Application Status

- **URL:** http://localhost:3000
- **Status:** ✅ Running
- **Database:** SQLite (persistent in Docker volume)
- **Environment:** Development mode

## Quick Test Commands

### 1. Check Application Health

```bash
curl http://localhost:3000/health
```

**Expected:** `{"status":"ok","timestamp":"..."}`

---

### 2. Create Admin Account

```bash
curl -X POST http://localhost:3000/api/admin/claim \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' \
  -c cookies.txt
```

**Expected:** `{"success":true,"message":"Admin claimed successfully",...}`

---

### 3. Login as Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' \
  -c cookies.txt
```

**Expected:** `{"success":true,"user":{...}}`

---

### 4. Get Current User Info

```bash
curl http://localhost:3000/api/auth/me \
  -b cookies.txt
```

**Expected:** `{"id":1,"username":"admin","is_admin":true,...}`

---

### 5. Add a Song (Placeholder - YouTube integration in Phase 5)

```bash
curl -X POST http://localhost:3000/api/songs/add \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "youtube_url": "https://youtube.com/watch?v=dQw4w9WgXcQ"
  }'
```

**Expected:** `{"success":true,"song":{...}}`

**Note:** Currently returns placeholder data. YouTube metadata will be added in Phase 5.

---

### 6. Get Song Queue

```bash
curl http://localhost:3000/api/songs/queue
```

**Expected:** `{"songs":[...]}`

---

### 7. Vote for a Song (as anonymous user)

```bash
curl -X POST http://localhost:3000/api/votes/1 \
  -c guest-cookies.txt
```

**Expected:** `{"success":true,"voted":true,"vote_count":1}`

---

### 8. Get Queue with Vote Counts

```bash
curl http://localhost:3000/api/songs/queue
```

**Expected:** Songs with `vote_count` field showing vote numbers

---

### 9. Play Next Top-Voted Song (Admin Only)

```bash
curl -X POST http://localhost:3000/api/playback/next \
  -b cookies.txt
```

**Expected:** `{"success":true,"song":{...},"stream_url":null}`

**Note:** `stream_url` will be null until Phase 5 (YouTube integration)

---

### 10. Get Playback Status

```bash
curl http://localhost:3000/api/playback/status
```

**Expected:** Current playback state with song info

---

### 11. Set Volume (Admin Only)

```bash
curl -X POST http://localhost:3000/api/playback/volume \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"volume": 80}'
```

**Expected:** `{"success":true,"volume":80}`

---

### 12. Get Recently Played Songs

```bash
curl http://localhost:3000/api/songs/recently-played
```

**Expected:** List of played songs

---

## Docker Management Commands

### View Logs

```bash
# All logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# Last 50 lines
docker-compose logs --tail=50
```

### Restart Container

```bash
docker-compose restart
```

### Stop Container

```bash
docker-compose down
```

### Start Container

```bash
docker-compose up -d
```

### Rebuild and Restart (after code changes)

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Access Container Shell

```bash
docker exec -it music-player sh
```

### View Database (inside container)

```bash
docker exec -it music-player sh
cd data
ls -la
# You'll see musicplayer.db
```

---

## Testing Socket.io Real-time Events

### Test with Browser DevTools

1. Open http://localhost:3000 (will show 404 - no frontend yet)
2. Open Browser DevTools Console (F12)
3. Run this JavaScript:

```javascript
// Connect to Socket.io
const socket = io('http://localhost:3000');

// Listen for events
socket.on('connect', () => {
  console.log('✅ Connected to Socket.io');
});

socket.on('queue_updated', () => {
  console.log('📋 Queue updated!');
});

socket.on('play_song', (data) => {
  console.log('🎵 Play song:', data);
});

socket.on('volume_changed', (data) => {
  console.log('🔊 Volume changed:', data);
});

// Test: Vote for a song (this should trigger queue_updated)
// Then check console
```

4. In another terminal, vote for a song:

```bash
curl -X POST http://localhost:3000/api/votes/1 -c test.txt
```

5. Check browser console - you should see "📋 Queue updated!"

---

## Complete Test Flow

```bash
# 1. Create admin
curl -X POST http://localhost:3000/api/admin/claim \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt

# 2. Add 3 songs
curl -X POST http://localhost:3000/api/songs/add \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"youtube_url":"https://youtube.com/watch?v=1"}'

curl -X POST http://localhost:3000/api/songs/add \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"youtube_url":"https://youtube.com/watch?v=2"}'

curl -X POST http://localhost:3000/api/songs/add \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"youtube_url":"https://youtube.com/watch?v=3"}'

# 3. Vote for songs (as different users)
curl -X POST http://localhost:3000/api/votes/1 -c user1.txt
curl -X POST http://localhost:3000/api/votes/1 -c user2.txt
curl -X POST http://localhost:3000/api/votes/2 -c user3.txt

# 4. Check queue (song 1 should be on top with 2 votes)
curl http://localhost:3000/api/songs/queue

# 5. Play next song (admin)
curl -X POST http://localhost:3000/api/playback/next -b cookies.txt

# 6. Check recently played
curl http://localhost:3000/api/songs/recently-played
```

---

## What's Working Now ✅

- ✅ User authentication (login, logout, admin claim)
- ✅ Anonymous user auto-creation for guests
- ✅ Song queue management (add, delete, restore)
- ✅ Voting system with real-time updates
- ✅ Playback controls (play, pause, resume, volume)
- ✅ Socket.io real-time broadcasting
- ✅ SQLite database with all tables
- ✅ Docker deployment with persistent storage

## Coming Soon 🚧

- **Phase 5:** YouTube integration (extract real metadata & stream URLs)
- **Phase 6:** Automated scheduler (cron-based playback) - **THE KEY FEATURE**
- **Phase 7:** Frontend views (admin panel, public voting page, audio player)

---

## Troubleshooting

### Container Won't Start

```bash
docker-compose down
docker-compose up -d
docker-compose logs
```

### Database Issues

```bash
# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Port Already in Use

```bash
# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead of 3000
```

### Check Container Status

```bash
docker ps
docker-compose ps
```

---

## API Documentation

Full API documentation is available in [README.md](README.md:1-288)

---

**Ready to continue?** The application is fully functional for testing. Next phases will add YouTube integration, automated scheduling, and the frontend interface!
