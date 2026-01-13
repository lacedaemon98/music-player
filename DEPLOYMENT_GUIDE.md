# Hướng Dẫn Deploy Lên Production Server

## Bước 1: Lấy SSH Private Key

Chạy lệnh này để xem private key:

```bash
cat ~/.ssh/id_rsa
```

Nếu file không tồn tại, thử:
```bash
cat ~/.ssh/id_ed25519
```

**Copy toàn bộ nội dung** từ `-----BEGIN ... KEY-----` đến `-----END ... KEY-----`

## Bước 2: Add SSH Key vào GitHub

1. Vào: https://github.com/lacedaemon98/music-player/settings/secrets/actions
2. Click **"New repository secret"**
3. Name: `SSH_PRIVATE_KEY`
4. Value: Paste private key vừa copy
5. Click **"Add secret"**

✅ **Báo với tôi khi xong bước này!**

## Bước 3: Setup Server (Tôi sẽ làm)

Sau khi bạn add SSH key, tôi sẽ:
1. Upload script lên server
2. SSH vào server
3. Clone repo và setup
4. Deploy lần đầu
5. Test auto-deploy

## Bước 4: Kiểm tra kết quả

Truy cập:
- Direct IP: http://103.148.57.174:3000
- Domain: http://music-player.thammytrunganh.com

## Từ giờ trở đi

Mỗi khi bạn push code:
```bash
git add .
git commit -m "Your message"
git push origin master
```

→ GitHub Actions tự động deploy!

Xem tiến trình: https://github.com/lacedaemon98/music-player/actions
