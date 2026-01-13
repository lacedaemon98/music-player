# Hướng dẫn thêm logo Trung Anh Group

## Bước 1: Lưu logo vào folder đúng

Lưu file logo của bạn (ảnh Trung Anh Group) vào đường dẫn:
```
/Users/robertpham/Downloads/music-player/public/images/logo.png
```

## Bước 2: Rebuild Docker container

Sau khi lưu logo, chạy lệnh sau để rebuild container:

```bash
cd /Users/robertpham/Downloads/music-player
docker-compose down
docker-compose build
docker-compose up -d
```

## Giao diện mới

Giao diện đã được thay đổi từ dark theme (đen) sang white-blue theme (trắng xanh):

### Màu sắc chính:
- **Background**: Gradient từ xanh nhạt (#e3f2fd) sang xám nhạt (#f5f5f5)
- **Navbar**: Gradient xanh đậm (#1976d2 đến #0d47a1)
- **Cards**: Trắng (#ffffff) với viền xám nhạt
- **Buttons**: Gradient xanh đậm
- **Voted songs**: Highlight màu xanh nhạt

### Logo:
- Logo sẽ hiển thị ở navbar (góc trái trên)
- Kích thước: 40px height
- Vị trí: Bên cạnh icon music và text "Music Player" / "Admin Panel"

## Kiểm tra

Sau khi rebuild, truy cập:
- Trang công khai: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- Login: http://localhost:3000/login

Logo sẽ xuất hiện ở navbar trên tất cả các trang.
