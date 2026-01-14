const express = require('express');
const router = express.Router();
const { Song, User, Vote, sequelize } = require('../models');
const { isAuthenticated, isAdmin, getOrCreateAnonymousUser } = require('../middleware/auth');
const { ipUserMiddleware } = require('../middleware/ipUser');
const youtubeService = require('../services/youtube');
const { parseSongMetadata } = require('../services/song-parser');
const logger = require('../utils/logger');

// Get queue (all unplayed songs with vote counts)
router.get('/queue', ipUserMiddleware, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;

    const songs = await Song.findAll({
      where: { played: false },
      include: [
        {
          model: User,
          as: 'addedBy',
          attributes: ['id', 'display_name']
        },
        {
          model: Vote,
          as: 'votes',
          attributes: []
        }
      ],
      attributes: {
        include: [
          [sequelize.fn('COUNT', sequelize.col('votes.id')), 'vote_count']
        ]
      },
      group: ['Song.id', 'addedBy.id'],
      order: [
        [sequelize.literal('vote_count'), 'DESC'],
        ['added_at', 'ASC']
      ]
    });

    // Add user_voted flag if user is authenticated
    const songsWithVotes = await Promise.all(songs.map(async (song) => {
      const songData = song.toJSON();

      if (userId) {
        const userVote = await Vote.findOne({
          where: {
            user_id: userId,
            song_id: song.id
          }
        });
        songData.user_voted = !!userVote;
      } else {
        songData.user_voted = false;
      }

      return songData;
    }));

    res.json({
      songs: songsWithVotes
    });
  } catch (error) {
    logger.error('[Songs] Error getting queue:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load danh sách chờ rồi'
    });
  }
});

// Get recently played songs
router.get('/recently-played', async (req, res) => {
  try {
    const songs = await Song.findAll({
      where: { played: true },
      include: [
        {
          model: User,
          as: 'addedBy',
          attributes: ['id', 'display_name']
        }
      ],
      order: [['played_at', 'DESC']],
      limit: 10
    });

    res.json({
      songs: songs.map(s => s.toJSON())
    });
  } catch (error) {
    logger.error('[Songs] Error getting recently played:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load bài đã phát rồi'
    });
  }
});

// Add song to queue
router.post('/add', ipUserMiddleware, async (req, res) => {
  try {
    const { youtube_url, dedication_message } = req.body;

    if (!youtube_url) {
      return res.status(400).json({
        success: false,
        message: 'Ê nhập link YouTube vào đây'
      });
    }

    // Validate dedication message length
    if (dedication_message && dedication_message.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Lời nhắn gửi quá dài rồi bạn ơi (tối đa 500 ký tự thôi)'
      });
    }

    // Check if user has remaining song adds for today (don't increment yet)
    await req.user.checkAndResetAdds();
    const canAdd = await req.user.canAddSong();
    if (!canAdd) {
      const maxAdds = req.user.is_admin ? 20 : 1;
      return res.status(400).json({
        success: false,
        message: `Hết lượt thêm bài rồi bạn ơi (${maxAdds} bài/ngày). Mai quay lại nha 🥺`
      });
    }

    // Validate YouTube URL
    if (!youtubeService.isValidUrl(youtube_url)) {
      return res.status(400).json({
        success: false,
        message: 'Link YouTube lỗi rồi bạn êi'
      });
    }

    // Fetch YouTube video info first to get video ID
    logger.info(`[Songs] Fetching YouTube info for: ${youtube_url}`);
    const videoInfo = await youtubeService.getVideoInfo(youtube_url);

    // Check duration (max 6 minutes = 360 seconds)
    if (videoInfo.duration > 360) {
      const minutes = Math.floor(videoInfo.duration / 60);
      const seconds = videoInfo.duration % 60;
      return res.status(400).json({
        success: false,
        message: `Bài nè dài quá bạn êi (${minutes}:${seconds.toString().padStart(2, '0')}). Chọn bài ngắn ngắn thôi nha (dưới 6p)`
      });
    }

    // Check if already in queue by youtube_id (more reliable than URL)
    const existingInQueue = await Song.findOne({
      where: {
        youtube_id: videoInfo.youtube_id,
        played: false
      }
    });

    if (existingInQueue) {
      return res.status(400).json({
        success: false,
        message: 'Bài nè đã có trong hàng chờ rồi',
        existing_song: {
          id: existingInQueue.id,
          title: existingInQueue.title,
          artist: existingInQueue.artist
        }
      });
    }

    // Check if recently played (last 10 played songs)
    const recentlyPlayed = await Song.findOne({
      where: {
        youtube_id: videoInfo.youtube_id,
        played: true
      },
      order: [['played_at', 'DESC']]
    });

    if (recentlyPlayed) {
      return res.status(400).json({
        success: false,
        message: 'Bài nè vừa phát xong mà. Chọn bài khác đi bạn'
      });
    }

    // Create song with YouTube metadata
    const song = await Song.create({
      title: videoInfo.title,
      artist: videoInfo.artist,
      youtube_url: youtube_url,
      youtube_id: videoInfo.youtube_id,
      duration: videoInfo.duration,
      thumbnail_url: videoInfo.thumbnail_url,
      added_by: req.user.id,
      dedication_message: dedication_message ? dedication_message.trim() : null
    });

    // Only increment the counter AFTER successful song creation
    await req.user.incrementSongAdd();

    logger.info(`[Songs] Song added by ${req.user.display_name}: ${videoInfo.title} - ${videoInfo.artist}`);

    // Broadcast queue update
    const io = req.app.get('io');
    io.emit('queue_updated');

    res.status(201).json({
      success: true,
      song: song.toJSON()
    });
  } catch (error) {
    logger.error('[Songs] Error adding song:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi rồi bạn ơi, không thêm được'
    });
  }
});

// Delete song (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const song = await Song.findByPk(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài nào như thế bạn êi :\u0027('
      });
    }

    const wasPlayed = song.played;

    // Delete all votes for this song first (to avoid foreign key constraint error)
    await Vote.destroy({ where: { song_id: song.id } });

    // Now delete the song
    await song.destroy();

    logger.info(`[Songs] Song deleted by admin: ${song.title}`);

    // Broadcast appropriate updates
    const io = req.app.get('io');
    if (wasPlayed) {
      // If it was a played song, update recently played list
      io.emit('recently_played_updated');
    } else {
      // If it was in queue, update queue
      io.emit('queue_updated');
    }

    res.json({
      success: true,
      message: 'Đã xóa bài rồi nha'
    });
  } catch (error) {
    logger.error('[Songs] Error deleting song:', error);
    res.status(500).json({
      success: false,
      message: 'Xóa bài lỗi rồi bạn ơi'
    });
  }
});

// Restore played song to queue (admin only)
router.post('/:id/restore', isAdmin, async (req, res) => {
  try {
    const song = await Song.findByPk(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài nào như thế bạn êi :\u0027('
      });
    }

    if (!song.played) {
      return res.status(400).json({
        success: false,
        message: 'Bài này chưa phát mà bạn'
      });
    }

    await song.restoreToQueue();

    logger.info(`[Songs] Song restored by admin: ${song.title}`);

    // Broadcast queue and recently played updates
    const io = req.app.get('io');
    io.emit('queue_updated');
    io.emit('recently_played_updated');

    res.json({
      success: true,
      message: 'Đã cho bài về hàng chờ rồi đó'
    });
  } catch (error) {
    logger.error('[Songs] Error restoring song:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi rồi, không restore được'
    });
  }
});

// Re-parse song metadata with Gemini AI (admin only)
router.post('/:id/reparse', isAdmin, async (req, res) => {
  try {
    const song = await Song.findByPk(req.params.id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài này'
      });
    }

    // Get original YouTube title
    const youtubeTitle = song.youtube_title || song.title;

    logger.info(`[Songs] Re-parsing metadata for song ${song.id}: "${youtubeTitle}"`);

    // Parse with Gemini AI
    const parsed = await parseSongMetadata(youtubeTitle, song.artist);

    // Update song metadata
    song.title = parsed.title;
    song.artist = parsed.artist;
    await song.save();

    logger.info(`[Songs] Re-parsed: "${youtubeTitle}" → Title: "${parsed.title}", Artist: "${parsed.artist}"`);

    // Broadcast updates
    const io = req.app.get('io');
    if (song.played) {
      io.emit('recently_played_updated');
    } else {
      io.emit('queue_updated');
    }

    res.json({
      success: true,
      message: 'Đã parse lại metadata thành công',
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist
      }
    });
  } catch (error) {
    logger.error('[Songs] Error re-parsing metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi parse lại metadata'
    });
  }
});

module.exports = router;
