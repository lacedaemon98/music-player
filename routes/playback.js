const express = require('express');
const router = express.Router();
const { Song, PlaybackState, sequelize } = require('../models');
const { isAdmin } = require('../middleware/auth');
const youtubeService = require('../services/youtube');
const offlineMusicService = require('../services/offlineMusic');
const logger = require('../utils/logger');
const { getCurrentSong, clearPlaybackData } = require('../socket');
const cache = require('../services/cache');

// Get current playback status
router.get('/status', async (req, res) => {
  try {
    const playbackState = await PlaybackState.getCurrent();
    const schedulerService = require('../services/scheduler');

    const response = {
      current_song_id: playbackState.current_song_id,
      is_playing: playbackState.is_playing,
      position: playbackState.position,
      volume: playbackState.volume,
      song: null,
      remaining_schedule_songs: schedulerService.getRemainingScheduleSongs(),
      next_song_prepared: null
    };

    if (playbackState.current_song_id) {
      const song = await Song.findByPk(playbackState.current_song_id);
      if (song) {
        response.song = {
          id: song.id,
          title: song.title,
          artist: song.artist,
          thumbnail_url: song.thumbnail_url
        };
      }
    }

    // Get pre-fetched next song info if available
    const nextSongPrepared = schedulerService.getNextSongPrepared();
    if (nextSongPrepared && nextSongPrepared.song) {
      response.next_song_prepared = {
        title: nextSongPrepared.song.title,
        artist: nextSongPrepared.song.artist,
        thumbnail_url: nextSongPrepared.song.thumbnail_url,
        has_announcement: !!nextSongPrepared.announcementData
      };
    } else if (nextSongPrepared && nextSongPrepared.isOffline) {
      response.next_song_prepared = {
        title: 'Nhạc offline',
        artist: 'Offline Music',
        is_offline: true
      };
    }

    res.json(response);
  } catch (error) {
    logger.error('[Playback] Error getting status:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load trạng thái phát nhạc'
    });
  }
});

// Get currently playing song (from server-side socket state)
router.get('/current', (req, res) => {
  try {
    const currentSong = getCurrentSong();
    res.json({
      success: true,
      song: currentSong
    });
  } catch (error) {
    logger.error('[Playback] Error getting current song:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load bài đang phát'
    });
  }
});

// Play specific song (admin only)
router.post('/play/:song_id', isAdmin, async (req, res) => {
  try {
    const songId = parseInt(req.params.song_id);
    const song = await Song.findByPk(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài nào như thế bạn êi :\u0027('
      });
    }

    // Update playback state
    const playbackState = await PlaybackState.getCurrent();
    playbackState.current_song_id = song.id;
    playbackState.is_playing = true;
    playbackState.position = 0;
    await playbackState.save();

    // Mark song as played
    await song.markAsPlayed();

    logger.info(`[Playback] Admin manually played: ${song.title}`);

    // Use server proxy endpoint instead of direct YouTube URL
    const streamUrl = `/api/playback/stream/${song.id}`;

    // Broadcast play event
    const io = req.app.get('io');
    io.emit('play_song', {
      song: song.toJSON(),
      stream_url: streamUrl,
      volume: playbackState.volume
    });
    io.emit('queue_updated');
    io.emit('recently_played_updated');

    res.json({
      success: true,
      song: song.toJSON(),
      stream_url: streamUrl
    });
  } catch (error) {
    logger.error('[Playback] Error playing song:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi phát nhạc rồi bạn ơi'
    });
  }
});

// Play next top-voted song (admin only)
router.post('/next', isAdmin, async (req, res) => {
  try {
    const playbackState = await PlaybackState.getCurrent();
    const io = req.app.get('io');
    const schedulerService = require('../services/scheduler');

    // Reset schedule counter when admin manually plays next
    // (to stop any ongoing multi-song schedule)
    schedulerService.resetScheduleSongsCounter();

    // Check if there's a locked song for upcoming schedule
    const lockedSongs = await schedulerService.getLockedSongs();

    if (lockedSongs.length > 0) {
      // There's a locked song - play it now (early schedule trigger)
      const lockedData = lockedSongs[0];
      const scheduleId = lockedData.schedule_id;

      logger.info(`[Playback] Admin triggered "Next" with locked song for schedule ${scheduleId}`);

      // Get cached data from scheduler
      const preparedData = schedulerService.scheduledSongs.get(scheduleId);

      if (preparedData) {
        // Play the prepared song
        const { song, streamUrl, announcementData, isOffline } = preparedData;

        if (isOffline || !song) {
          // Play offline music
          const offlineMusicService = require('../services/offlineMusic');
          const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

          if (!offlineMusic) {
            return res.status(404).json({
              success: false,
              message: 'Không có nhạc offline'
            });
          }

          const offlineStreamUrl = `/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`;

          playbackState.current_song_id = null;
          playbackState.is_playing = true;
          await playbackState.save();

          io.emit('play_song', {
            song: {
              id: null,
              title: offlineMusic.title,
              artist: 'Offline Music',
              thumbnail_url: '/images/offline-music.png'
            },
            stream_url: offlineStreamUrl,
            volume: playbackState.volume,
            auto_next: false
          });

          // Clear cache
          schedulerService.scheduledSongs.delete(scheduleId);

          // Mark schedule as executed (to prevent it from running again at scheduled time)
          const Schedule = require('../models').Schedule;
          const schedule = await Schedule.findByPk(scheduleId);
          if (schedule) {
            schedule.last_run = new Date();
            await schedule.save();
            logger.info(`[Playback] Marked schedule ${scheduleId} as executed (early trigger by admin - offline music)`);
          }

          return res.json({
            success: true,
            song: { title: offlineMusic.title, artist: 'Offline Music' },
            stream_url: offlineStreamUrl,
            is_offline: true
          });
        }

        // Play the locked song with announcement if available
        playbackState.current_song_id = song.id;
        playbackState.is_playing = true;
        await playbackState.save();

        if (announcementData) {
          io.emit('play_announcement', {
            song: song.toJSON ? song.toJSON() : song,
            announcement_text: announcementData.text,
            stream_url: streamUrl,
            volume: playbackState.volume,
            auto_next: false
          });
        } else {
          io.emit('play_song', {
            song: song.toJSON ? song.toJSON() : song,
            stream_url: streamUrl,
            volume: playbackState.volume,
            auto_next: false
          });
        }

        io.emit('queue_updated');

        // Clear cache after playing
        schedulerService.scheduledSongs.delete(scheduleId);

        // Mark schedule as executed (to prevent it from running again at scheduled time)
        const Schedule = require('../models').Schedule;
        const schedule = await Schedule.findByPk(scheduleId);
        if (schedule) {
          schedule.last_run = new Date();
          await schedule.save();
          logger.info(`[Playback] Marked schedule ${scheduleId} as executed (early trigger by admin)`);
        }

        logger.info(`[Playback] Played locked song early: ${song.title}`);

        return res.json({
          success: true,
          song: song.toJSON ? song.toJSON() : song,
          stream_url: streamUrl,
          played_locked_song: true
        });
      }
    }

    // No locked song - proceed with normal top voted song
    const topSong = await Song.getTopVoted();

    // If no songs in queue, try to play offline music
    if (!topSong) {
      logger.warn('[Playback] No songs in queue, trying offline music');

      const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

      if (!offlineMusic) {
        return res.status(404).json({
          success: false,
          message: 'Chưa có bài nào trong hàng chờ hết'
        });
      }

      // Play offline music
      logger.info(`[Playback] Playing offline music: ${offlineMusic.title}`);

      const streamUrl = `/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`;

      // Update playback state (no song ID for offline music)
      playbackState.current_song_id = null;
      playbackState.is_playing = true;
      playbackState.position = 0;
      await playbackState.save();

      // Broadcast play event (manual next - no auto-next)
      io.emit('play_song', {
        song: {
          id: null,
          title: offlineMusic.title,
          artist: 'Offline Music',
          thumbnail_url: '/images/offline-music.png'
        },
        stream_url: streamUrl,
        volume: playbackState.volume,
        auto_next: false
      });

      return res.json({
        success: true,
        song: {
          title: offlineMusic.title,
          artist: 'Offline Music'
        },
        stream_url: streamUrl,
        is_offline: true
      });
    }

    // Update playback state
    playbackState.current_song_id = topSong.id;
    playbackState.is_playing = true;
    playbackState.position = 0;
    await playbackState.save();

    // Mark song as played
    await topSong.markAsPlayed();

    logger.info(`[Playback] Admin played next song: ${topSong.title}`);

    // Generate DJ announcement if dedication message exists
    const djService = require('../services/dj');
    let announcementData = null;

    if (topSong.dedication_message) {
      try {
        logger.info('[Playback] Generating DJ announcement for:', topSong.title);
        announcementData = await djService.generateAnnouncement(topSong);
      } catch (error) {
        logger.error('[Playback] Announcement generation failed, continuing without it:', error);
      }
    }

    // ALWAYS PRE-EXTRACT YouTube stream URL (avoid delay during playback)
    let streamUrl = `/api/playback/stream/${topSong.id}`;

    if (topSong.youtube_url) {
      try {
        logger.info('[Playback] Pre-extracting YouTube stream URL for instant playback...');
        const youtubeService = require('../services/youtube');
        const directStreamUrl = await youtubeService.getStreamUrl(topSong.youtube_url);
        streamUrl = directStreamUrl; // Use direct URL instead of proxy
        logger.info('[Playback] Pre-extraction successful, stream ready for instant playback');
      } catch (error) {
        logger.error('[Playback] Pre-extraction failed, will use proxy:', error.message);
        logger.error('[Playback] Pre-extraction error details:', error.stack || 'No stack trace');
        // Fall back to proxy URL (will try extraction again in /stream endpoint)
      }
    }

    // Broadcast appropriate play event based on announcement availability
    if (announcementData) {
      const payload = {
        song: topSong.toJSON(),
        announcement_text: announcementData.text,
        stream_url: streamUrl,
        volume: playbackState.volume,
        auto_next: false // Manual next - no auto-next
      };

      // Add audio URL if TTS audio was generated
      if (announcementData.audioPath) {
        const path = require('path');
        const filename = path.basename(announcementData.audioPath);
        payload.announcement_audio_url = `/api/playback/tts/audio/${filename}`;
        logger.info('[Playback] Broadcasting play_announcement with ElevenLabs audio');
      } else {
        logger.info('[Playback] Broadcasting play_announcement with text (Web Speech fallback)');
      }

      io.emit('play_announcement', payload);
    } else {
      logger.info('[Playback] Broadcasting play_song event (manual next - no auto-next)');
      io.emit('play_song', {
        song: topSong.toJSON(),
        stream_url: streamUrl,
        volume: playbackState.volume,
        auto_next: false
      });
    }

    io.emit('queue_updated');
    io.emit('recently_played_updated');

    res.json({
      success: true,
      song: topSong.toJSON(),
      stream_url: streamUrl
    });
  } catch (error) {
    logger.error('[Playback] Error playing next:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi next bài rồi bạn ơi'
    });
  }
});

// Pause playback (admin only)
router.post('/pause', isAdmin, async (req, res) => {
  try {
    const playbackState = await PlaybackState.getCurrent();
    playbackState.is_playing = false;
    await playbackState.save();

    logger.info('[Playback] Playback paused by admin');

    // Broadcast pause event
    const io = req.app.get('io');
    io.emit('playback_paused');

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('[Playback] Error pausing:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi pause rồi bạn ơi'
    });
  }
});

// Resume playback (admin only)
router.post('/resume', isAdmin, async (req, res) => {
  try {
    const playbackState = await PlaybackState.getCurrent();
    playbackState.is_playing = true;
    await playbackState.save();

    logger.info('[Playback] Playback resumed by admin');

    // Broadcast resume event
    const io = req.app.get('io');
    io.emit('playback_resumed');

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('[Playback] Error resuming:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi resume rồi bạn ơi'
    });
  }
});

// Stop playback completely (admin only)
router.post('/stop', isAdmin, async (req, res) => {
  try {
    logger.info('[Playback] ===== STOP REQUESTED =====');

    // FIRST: Update database (source of truth) - DB is checked first in resume logic
    const playbackState = await PlaybackState.getCurrent();
    playbackState.current_song_id = null;
    playbackState.is_playing = false;
    playbackState.position = 0;
    await playbackState.save();
    logger.info('[Playback] Updated database - is_playing: false, song_id: null');

    // SECOND: Clear cached playback data (prevent resume from cache)
    clearPlaybackData();
    logger.info('[Playback] Cleared playback cache (lastPlayedSongData, currentlyPlayingSong)');

    // THIRD: Reset schedule counter (stop any ongoing schedule)
    const schedulerService = require('../services/scheduler');
    schedulerService.resetScheduleSongsCounter();
    logger.info('[Playback] Reset schedule counter');

    // FOURTH: Broadcast stop event to all clients (admin and public)
    const io = req.app.get('io');
    io.emit('playback_stopped');
    logger.info('[Playback] Broadcasted playback_stopped event');

    logger.info('[Playback] ===== STOP COMPLETED =====');

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('[Playback] Error stopping:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi stop rồi bạn ơi'
    });
  }
});

// Set volume (admin only)
router.post('/volume', isAdmin, async (req, res) => {
  try {
    const { volume } = req.body;

    if (volume === undefined || volume < 0 || volume > 100) {
      return res.status(400).json({
        success: false,
        message: 'Volume phải từ 0 đến 100 bạn êi'
      });
    }

    const playbackState = await PlaybackState.getCurrent();
    playbackState.volume = volume;
    await playbackState.save();

    logger.info(`[Playback] Volume set to ${volume} by admin`);

    // Broadcast volume change event
    const io = req.app.get('io');
    io.emit('volume_changed', { volume });

    res.json({
      success: true,
      volume
    });
  } catch (error) {
    logger.error('[Playback] Error setting volume:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi chỉnh volume rồi'
    });
  }
});

// Get direct stream URL from YouTube (for seekable playback)
router.get('/stream/:song_id', async (req, res) => {
  try {
    const songId = parseInt(req.params.song_id);
    const song = await Song.findByPk(songId);

    if (!song) {
      logger.warn(`[Playback] Song ${songId} not found`);
      return res.status(404).send('Song not found');
    }

    logger.info(`[Playback] Getting stream URL for: ${song.title}`);

    // Check cache first
    const cacheKey = `stream_url:${song.youtube_url}`;
    const cachedUrl = cache.get(cacheKey);

    if (cachedUrl) {
      logger.info(`[Playback] Using cached stream URL for: ${song.title}`);
      return res.redirect(cachedUrl);
    }

    // Cache miss - extract using YouTube service (90 second timeout)
    logger.info(`[Playback] Cache miss - extracting stream URL for: ${song.title}`);
    const youtubeService = require('../services/youtube');

    try {
      // Use YouTube service with proper timeout handling (90 seconds)
      const directUrl = await youtubeService.getStreamUrl(song.youtube_url);

      if (!directUrl) {
        throw new Error('Empty stream URL returned');
      }

      // URL is already cached by YouTube service, but cache again here with same key
      cache.set(cacheKey, directUrl, 5 * 60 * 1000);

      logger.info(`[Playback] Got and cached stream URL for: ${song.title}`);

      // Redirect to direct URL (supports range requests for seeking)
      return res.redirect(directUrl);

    } catch (ytError) {
      // YouTube streaming failed - try to fallback to offline music
      logger.error(`[Playback] YouTube stream failed for ${song.title}:`, ytError.message);
      logger.error(`[Playback] Error details: ${ytError.stack || 'No stack trace'}`);
      logger.info('[Playback] Attempting to fallback to offline music');

      const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

      if (!offlineMusic) {
        logger.error('[Playback] No offline music available for fallback');
        return res.status(500).send('Failed to get stream URL and no offline music available');
      }

      // Redirect to offline music instead
      logger.info(`[Playback] Falling back to offline music: ${offlineMusic.title}`);
      return res.redirect(`/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`);
    }

  } catch (error) {
    logger.error('[Playback] Error in stream endpoint:', error.message);
    res.status(500).send('Failed to get stream URL');
  }
});

// Stream offline music file
router.get('/stream-offline/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const path = require('path');
    const fs = require('fs');

    const offlineMusicDir = path.join(__dirname, '../data/offline-music');
    const filePath = path.join(offlineMusicDir, filename);

    // Security: Check if file is within offline music directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(offlineMusicDir);

    if (!resolvedPath.startsWith(resolvedDir)) {
      logger.warn(`[Playback] Attempted path traversal: ${filename}`);
      return res.status(403).send('Access denied');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.warn(`[Playback] Offline music file not found: ${filename}`);
      return res.status(404).send('File not found');
    }

    logger.info(`[Playback] Streaming offline music: ${filename}`);

    // Get file stats for range request support
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg'
      });

      fileStream.pipe(res);
    } else {
      // No range request, stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes'
      });

      fs.createReadStream(filePath).pipe(res);
    }

  } catch (error) {
    logger.error('[Playback] Error streaming offline music:', error);
    res.status(500).send('Failed to stream offline music');
  }
});

// Stream DJ announcement TTS audio
router.get('/stream-announcement/:song_id', async (req, res) => {
  try {
    const songId = parseInt(req.params.song_id);
    const song = await Song.findByPk(songId);

    if (!song || !song.dedication_message) {
      logger.warn(`[Playback] No announcement for song ${songId}`);
      return res.status(404).send('No announcement available');
    }

    const path = require('path');
    const fs = require('fs');
    const crypto = require('crypto');

    // Reconstruct cache file path (must match the one in tts.js)
    const cacheKey = crypto.createHash('md5')
      .update(song.dedication_message)
      .digest('hex');
    const TTS_CACHE_DIR = path.join(__dirname, '../data/tts-cache');
    const filePath = path.join(TTS_CACHE_DIR, `${songId}-${cacheKey}.mp3`);

    if (!fs.existsSync(filePath)) {
      logger.error(`[Playback] TTS cache file not found: ${filePath}`);
      return res.status(404).send('Announcement audio not found');
    }

    logger.info(`[Playback] Streaming announcement: ${filePath}`);

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(filePath).pipe(res);

  } catch (error) {
    logger.error('[Playback] Error streaming announcement:', error);
    res.status(500).send('Failed to stream announcement');
  }
});

// Serve TTS audio files from cache
router.get('/tts/audio/:filename', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');

    const filename = req.params.filename;

    // Security: Only allow mp3 files and prevent directory traversal
    if (!filename.endsWith('.mp3') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).send('Invalid filename');
    }

    const TTS_CACHE_DIR = path.join(__dirname, '../data/tts-cache');
    const filePath = path.join(TTS_CACHE_DIR, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.warn('[Playback] TTS audio file not found:', filePath);
      return res.status(404).send('Audio file not found');
    }

    // Set headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream the file
    fs.createReadStream(filePath).pipe(res);

  } catch (error) {
    logger.error('[Playback] Error serving TTS audio:', error);
    res.status(500).send('Failed to serve audio file');
  }
});

module.exports = router;
