# 🚀 Deployment Guide

## Automatic Deployment (GitHub Actions)

Mỗi khi push code lên `master` branch, GitHub Actions sẽ tự động:

1. ✅ Pull code mới nhất về production server
2. ✅ Rebuild Docker image (với `--no-cache` để đảm bảo fresh build)
3. ✅ Restart containers với config mới
4. ✅ Clean up unused Docker resources
5. ✅ Hiển thị container status và logs

**Bạn không cần làm gì thêm!** Chỉ cần:

```bash
git add .
git commit -m "Your commit message"
git push origin master
```

GitHub Actions sẽ tự động deploy lên production trong ~3-5 phút.

---

## 🎵 Upload Nhạc Offline lên Production

### Cách 1: Upload 1 file

```bash
./upload-music.sh ~/Downloads/bai-hat.mp3
```

### Cách 2: Upload cả folder nhạc

```bash
./upload-music-folder.sh ~/Downloads/my-music/
```

Script sẽ:
- ✅ Tự động tạo folder nếu chưa có
- ✅ Upload với progress bar (rsync)
- ✅ Verify file đã upload thành công
- ✅ Support .mp3 và .m4a

**Sau khi upload:**
1. Vào admin panel: http://103.148.57.174:3000/admin
2. File nhạc sẽ xuất hiện trong offline music library
3. Add vào queue để phát

---

## 📂 Cấu trúc Production

```
/root/music-player/
├── data/
│   ├── musicplayer.db          # Database (persistent)
│   ├── offline-music/          # Nhạc offline (persistent)
│   └── tts-cache/              # Cached TTS files (persistent)
├── .env                         # Environment variables (API keys)
├── docker-compose.yml           # Docker config
└── ... (source code từ GitHub)
```

### Folders được mount vào Docker:

- ✅ `/data` - Persistent data (database, music, cache)
- ✅ `/public` - Static files (CSS, JS, images)
- ✅ `/views` - EJS templates
- ✅ `/routes` - API endpoints
- ✅ `/services` - Business logic

**Lợi ích:** Code changes reflect ngay lập tức, không cần rebuild Docker (chỉ cần restart container).

---

## 🔑 Environment Variables

File `/root/music-player/.env` trên production:

```env
GOOGLE_AI_API_KEY=AIzaSyBbBYFBOaMQU-Fo5oF68Z7JSuTNsD5NL3Y
ELEVENLABS_API_KEY=sk_3370c64813da9d00b85302898cdafee5ed115b52afcc5912
```

**Nếu cần update API keys:**

```bash
ssh -i ~/.ssh/id_rob_mac_mini_rsa root@103.148.57.174
cd /root/music-player
nano .env
# Edit keys, then save
docker compose restart
```

---

## 🛠️ Manual Deployment Commands

Nếu cần deploy manually:

```bash
# SSH vào server
ssh -i ~/.ssh/id_rob_mac_mini_rsa root@103.148.57.174

# Pull code mới
cd /root/music-player
git pull origin master

# Rebuild và restart
docker compose down
docker compose build --no-cache
docker compose up -d

# Check logs
docker compose logs -f
```

---

## 📊 Monitoring & Logs

### Xem logs real-time:
```bash
ssh -i ~/.ssh/id_rob_mac_mini_rsa root@103.148.57.174 "docker compose -f /root/music-player/docker-compose.yml logs -f"
```

### Xem container status:
```bash
ssh -i ~/.ssh/id_rob_mac_mini_rsa root@103.148.57.174 "docker compose -f /root/music-player/docker-compose.yml ps"
```

### Restart container:
```bash
ssh -i ~/.ssh/id_rob_mac_mini_rsa root@103.148.57.174 "docker compose -f /root/music-player/docker-compose.yml restart"
```

---

## 🐛 Troubleshooting

### Container không start:
```bash
docker compose logs
docker compose ps
```

### Database bị lỗi:
```bash
# Backup database
cp /root/music-player/data/musicplayer.db /root/backup-$(date +%Y%m%d).db

# Reset database (cẩn thận - mất data!)
rm /root/music-player/data/musicplayer.db
docker compose restart
```

### Gemini/ElevenLabs không hoạt động:
```bash
# Check API keys
cat /root/music-player/.env

# Check logs
docker compose logs | grep -E "(Gemini|ElevenLabs)"
```

---

## 📝 Notes

- Production server: **103.148.57.174:3000**
- SSH key: `~/.ssh/id_rob_mac_mini_rsa`
- Container name: `music-player`
- Persistent data: Docker volume `music-player-data`

