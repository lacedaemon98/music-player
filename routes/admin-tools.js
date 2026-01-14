const express = require('express');
const router = express.Router();
const { Song } = require('../models');
const { isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Set dedication message for any song (admin only)
router.post('/set-dedication/:song_id', isAdmin, async (req, res) => {
  try {
    const songId = parseInt(req.params.song_id);
    const { dedication_message } = req.body;

    const song = await Song.findByPk(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài hát'
      });
    }

    // Set or clear dedication message
    song.dedication_message = dedication_message || null;
    await song.save();

    logger.info(`[Admin Tools] ${req.user.username} set dedication for "${song.title}": ${song.dedication_message || '(cleared)'}`);

    res.json({
      success: true,
      message: dedication_message ? 'Đã set dedication message' : 'Đã xóa dedication message',
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        dedication_message: song.dedication_message
      }
    });
  } catch (error) {
    logger.error('[Admin Tools] Error setting dedication:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi set dedication message'
    });
  }
});

// Set dedication message for Trú Mưa (admin only, one-time use)
router.post('/set-dedication-tru-mua', isAdmin, async (req, res) => {
  try {
    // Find song "Trú Mưa"
    const song = await Song.findOne({
      where: {
        title: 'Trú Mưa'
      }
    });

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài "Trú Mưa"'
      });
    }

    // Set dedication message
    song.dedication_message = 'Đi qua những ngày mưa để thấy yêu thêm những ngày nắng';
    await song.save();

    logger.info(`[Admin Tools] ${req.user.username} set dedication for "${song.title}": ${song.dedication_message}`);

    res.json({
      success: true,
      message: 'Đã set dedication message thành công',
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        dedication_message: song.dedication_message
      }
    });
  } catch (error) {
    logger.error('[Admin Tools] Error setting dedication:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi set dedication message'
    });
  }
});

module.exports = router;
