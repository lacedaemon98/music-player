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
    // Sanitize filename - remove special characters, keep Vietnamese characters
    const sanitized = file.originalname
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
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

module.exports = router;
