const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Configure multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'data', 'offline-music');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Fix UTF-8 encoding for Vietnamese filenames
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // Sanitize filename - remove special characters, keep Vietnamese characters
    const sanitized = originalName
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    // Add timestamp to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    cb(null, `${name}-${timestamp}${ext}`);
  }
});

// File filter - only allow audio files
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/m4a'];
  const allowedExts = ['.mp3', '.m4a'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = allowedMimes.includes(file.mimetype);
  const extOk = allowedExts.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file .mp3 hoặc .m4a'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// Upload single music file (admin only)
router.post('/music', isAdmin, upload.single('music'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file nào được upload'
      });
    }

    logger.info(`[Upload] Admin uploaded offline music: ${req.file.filename}`);

    res.json({
      success: true,
      message: 'Upload nhạc thành công',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      }
    });
  } catch (error) {
    logger.error('[Upload] Error uploading music:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi upload nhạc'
    });
  }
});

// Upload multiple music files (admin only)
router.post('/music/batch', isAdmin, upload.array('music', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có file nào được upload'
      });
    }

    logger.info(`[Upload] Admin uploaded ${req.files.length} offline music files`);

    res.json({
      success: true,
      message: `Upload thành công ${req.files.length} file nhạc`,
      files: req.files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        size: f.size
      }))
    });
  } catch (error) {
    logger.error('[Upload] Error uploading music batch:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi upload nhạc'
    });
  }
});

// List offline music files (admin only)
router.get('/music/list', isAdmin, async (req, res) => {
  try {
    const musicDir = path.join(process.cwd(), 'data', 'offline-music');

    try {
      await fs.access(musicDir);
    } catch {
      return res.json({
        success: true,
        files: []
      });
    }

    const files = await fs.readdir(musicDir);
    const musicFiles = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.mp3' || ext === '.m4a') {
        const filePath = path.join(musicDir, file);
        const stats = await fs.stat(filePath);

        musicFiles.push({
          filename: file,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          uploadedAt: stats.mtime
        });
      }
    }

    // Sort by upload time descending
    musicFiles.sort((a, b) => b.uploadedAt - a.uploadedAt);

    res.json({
      success: true,
      files: musicFiles
    });
  } catch (error) {
    logger.error('[Upload] Error listing offline music:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách nhạc offline'
    });
  }
});

// Rename offline music file (admin only)
router.put('/music/rename', isAdmin, async (req, res) => {
  try {
    const { oldFilename, newFilename } = req.body;

    if (!oldFilename || !newFilename) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu tên file cũ hoặc tên file mới'
      });
    }

    // Validate new filename
    if (newFilename.includes('/') || newFilename.includes('\\') || newFilename.includes('..')) {
      return res.status(400).json({
        success: false,
        message: 'Tên file không hợp lệ'
      });
    }

    const musicDir = path.join(process.cwd(), 'data', 'offline-music');
    const oldPath = path.join(musicDir, oldFilename);
    const newPath = path.join(musicDir, newFilename);

    // Check if old file exists
    try {
      await fs.access(oldPath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy file gốc'
      });
    }

    // Check if new filename already exists
    try {
      await fs.access(newPath);
      return res.status(400).json({
        success: false,
        message: 'Tên file mới đã tồn tại'
      });
    } catch {
      // Good - new filename doesn't exist
    }

    // Rename file
    await fs.rename(oldPath, newPath);

    logger.info(`[Upload] Admin renamed offline music: "${oldFilename}" → "${newFilename}"`);

    res.json({
      success: true,
      message: 'Đổi tên file thành công',
      oldFilename,
      newFilename
    });
  } catch (error) {
    logger.error('[Upload] Error renaming music:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi đổi tên file'
    });
  }
});

// Delete offline music file (admin only)
router.delete('/music/:filename', isAdmin, async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu tên file'
      });
    }

    // Security: prevent path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return res.status(400).json({
        success: false,
        message: 'Tên file không hợp lệ'
      });
    }

    const musicDir = path.join(process.cwd(), 'data', 'offline-music');
    const filePath = path.join(musicDir, filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy file'
      });
    }

    // Delete file
    await fs.unlink(filePath);

    logger.info(`[Upload] Admin deleted offline music: ${filename}`);

    res.json({
      success: true,
      message: 'Xóa file thành công',
      filename
    });
  } catch (error) {
    logger.error('[Upload] Error deleting music:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa file'
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = router;
