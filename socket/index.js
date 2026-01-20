const logger = require('../utils/logger');

// Track active admin session with user info
let activeAdminSocket = null;
let activeAdminUserId = null;
let activeAdminSessionId = null;

// Track currently playing song
let currentlyPlayingSong = null;

// Track detailed playback state (for resume on reconnect)
let playbackState = {
  stage: 'idle', // 'idle' | 'announcement' | 'music'
  position: 0, // seconds
  song: null,
  announcement_text: null,
  announcement_url: null, // ElevenLabs audio URL for announcement
  stream_url: null,
  auto_next: false,
  volume: 70
};

// Store last played song data for reconnect (including full play_song event data)
let lastPlayedSongData = null;

function setupSocket(io) {
  logger.info('[Socket.io] Initializing Socket.io handlers');

  io.on('connection', (socket) => {
    logger.info(`[Socket.io] Client connected: ${socket.id}`);

    // Handle admin room joining
    socket.on('join_admin_room', (data) => {
      const isTakeover = data && data.takeover === true;
      logger.info(`[Socket.io] Admin room join request from: ${socket.id}, takeover: ${isTakeover}`);

      // Check if user is admin (will be available after Passport auth)
      if (socket.request.session && socket.request.session.passport) {
        const userId = socket.request.session.passport.user;
        const sessionId = socket.request.session.id;

        logger.info(`[Socket.io] User ${userId} attempting to join admin room (session: ${sessionId})`);

        const { User } = require('../models');
        User.findByPk(userId)
          .then(user => {
            if (user && user.is_admin) {
              // Check if there's already an active admin
              const hasActiveAdmin = activeAdminSocket !== null;
              const isSameUser = activeAdminUserId === userId;

              logger.info(`[Socket.io] hasActiveAdmin: ${hasActiveAdmin}, isSameUser: ${isSameUser}, isTakeover: ${isTakeover}`);

              // If there's already an active admin
              if (hasActiveAdmin) {
                // Check if a song is currently playing
                const isSongPlaying = currentlyPlayingSong !== null;

                // If this is NOT a takeover attempt → Reject
                if (!isTakeover) {
                  logger.warn(`[Socket.io] Admin already active, rejecting non-takeover connection from ${socket.id}`);
                  socket.emit('admin_rejected', {
                    message: 'Admin panel đã được mở ở tab/thiết bị khác. Refresh sẽ không chiếm quyền.',
                    songPlaying: isSongPlaying,
                    currentSong: currentlyPlayingSong
                  });
                  return; // Don't proceed with activation
                }

                // If this IS a takeover attempt → Kick the old admin
                logger.warn(`[Socket.io] Takeover requested! Disconnecting previous admin socket: ${activeAdminSocket.id}`);

                // Inform the new admin if a song is playing
                if (isSongPlaying) {
                  logger.warn(`[Socket.io] WARNING: Taking over while song is playing: ${currentlyPlayingSong.title}`);
                  socket.emit('takeover_warning', {
                    message: 'Đang có bài hát phát! Bạn có chắc muốn chiếm quyền không?',
                    currentSong: currentlyPlayingSong
                  });
                }

                // Emit force disconnect to old socket
                activeAdminSocket.emit('force_disconnect', {
                  message: 'Admin panel đã được mở ở tab/thiết bị khác. Chỉ cho phép 1 admin panel cùng lúc.'
                });

                // Forcefully disconnect the old socket
                activeAdminSocket.disconnect(true);

                logger.info(`[Socket.io] Previous admin disconnected by takeover`);
              }

              // Set new active admin
              activeAdminSocket = socket;
              activeAdminUserId = userId;
              activeAdminSessionId = sessionId;
              socket.join('admin');
              logger.info(`[Socket.io] ✅ Admin ${user.display_name} (ID: ${userId}) is now active in admin room (socket: ${socket.id})`);

              // Mark this socket as admin
              socket.isAdmin = true;
              socket.adminUserId = userId;

              // Confirm to client that they're the active admin
              socket.emit('admin_active', {
                message: 'Bạn là admin panel duy nhất đang hoạt động'
              });
            } else {
              logger.warn(`[Socket.io] User ${userId} is not admin, rejecting join_admin_room`);
            }
          })
          .catch(err => {
            logger.error('[Socket.io] Error joining admin room:', err);
          });
      } else {
        logger.warn(`[Socket.io] No session/passport found for socket ${socket.id}`);
      }
    });

    // Handle playback state update (for resume on reconnect)
    socket.on('playback_state_update', (data) => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        // Update playback state
        playbackState.stage = data.stage || playbackState.stage;
        playbackState.position = data.position || 0;
        playbackState.song = data.song || playbackState.song;
        playbackState.announcement_text = data.announcement_text || null;
        playbackState.announcement_url = data.announcement_url || null;
        playbackState.stream_url = data.stream_url || playbackState.stream_url;
        playbackState.auto_next = data.auto_next !== undefined ? data.auto_next : playbackState.auto_next;
        playbackState.volume = data.volume || playbackState.volume;
      }
    });

    // Handle request for playback state (for resume on reconnect)
    socket.on('get_playback_state', async () => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Admin requesting playback state for resume`);

        // FIRST: Check if lastPlayedSongData exists
        // If it was cleared by stop/end, don't resume
        if (!lastPlayedSongData) {
          logger.info(`[Socket.io] No cached playback data, not resuming`);
          socket.emit('playback_state', { stage: 'idle', song: null });
          return;
        }

        // SECOND: Check database to ensure there's actually a song playing
        const PlaybackState = require('../models').PlaybackState;
        const dbState = await PlaybackState.getCurrent();

        // If database says not playing or no song, don't resume
        if (!dbState.is_playing || !dbState.current_song_id) {
          logger.info(`[Socket.io] Database shows no active playback, not resuming`);
          socket.emit('playback_state', { stage: 'idle', song: null });
          return;
        }

        // THIRD: Check if data is recent (within last 10 minutes)
        if (Date.now() - lastPlayedSongData.timestamp > 10 * 60 * 1000) {
          logger.info(`[Socket.io] Cached data too old, not resuming`);
          socket.emit('playback_state', { stage: 'idle', song: null });
          return;
        }

        // All checks passed - send cached data for resume
        logger.info(`[Socket.io] Sending cached play_song data for reconnect (song: ${lastPlayedSongData.song.title})`);

        socket.emit('play_song', {
          song: lastPlayedSongData.song,
          stream_url: lastPlayedSongData.stream_url,
          announcement_text: lastPlayedSongData.announcement_text,
          announcement_url: lastPlayedSongData.announcement_url,
          volume: lastPlayedSongData.volume,
          auto_next: lastPlayedSongData.auto_next,
          is_reconnect: true // Flag to indicate this is a reconnect
        });
      }
    });

    // Handle song started notification from admin
    socket.on('song_started', (data) => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Song started: ${data.song.title}`);
        currentlyPlayingSong = data.song;

        // Store full play_song data for reconnect (including stream_url, announcement, etc.)
        lastPlayedSongData = {
          song: data.song,
          stream_url: data.stream_url,
          announcement_text: data.announcement_text,
          announcement_url: data.announcement_url,
          volume: data.volume,
          auto_next: data.auto_next,
          timestamp: Date.now()
        };

        // Only update server state - don't re-broadcast play_song (would cause infinite loop)
        // Public clients will get the song info via 'get_current_song' or when they load the page
        io.emit('song_playing_update', { song: data.song });
      }
    });

    // Handle song ended notification from admin
    socket.on('song_ended_notify', async () => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Song ended, broadcasting to all clients`);

        // Check if there are remaining songs in schedule
        const schedulerService = require('../services/scheduler');
        const shouldPlayNext = schedulerService.shouldPlayNextInSchedule();

        if (shouldPlayNext) {
          logger.info(`[Socket.io] Auto-playing next song in schedule (${schedulerService.getRemainingScheduleSongs()} remaining after this)`);

          // Trigger next song in schedule
          const PlaybackState = require('../models').PlaybackState;
          const playbackStateRecord = await PlaybackState.getCurrent();
          const volume = playbackStateRecord.volume;

          // Play next song using pre-fetched data if available
          await schedulerService.playNextSongInSchedule(volume, schedulerService.getRemainingScheduleSongs() > 0);

          return; // Don't clear state, next song will play
        }

        // No more songs in schedule - clear state
        logger.info(`[Socket.io] No more songs in schedule, clearing playback state`);

        // Clear currently playing song
        currentlyPlayingSong = null;
        // Clear last played song data
        lastPlayedSongData = null;
        // Clear playback state
        playbackState = {
          stage: 'idle',
          position: 0,
          song: null,
          announcement_text: null,
          announcement_url: null,
          stream_url: null,
          auto_next: false,
          volume: playbackState.volume // Keep volume
        };
        // Broadcast to all clients (including public pages)
        io.emit('song_ended');
      }
    });

    // Handle playback stopped notification (schedule ended, manual next without auto-next)
    socket.on('playback_stopped', () => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Playback stopped (schedule ended), broadcasting to all clients`);
        // Clear currently playing song
        currentlyPlayingSong = null;
        // Clear last played song data
        lastPlayedSongData = null;
        // Clear playback state
        playbackState = {
          stage: 'idle',
          position: 0,
          song: null,
          announcement_text: null,
          announcement_url: null,
          stream_url: null,
          auto_next: false,
          volume: playbackState.volume // Keep volume
        };
        // Broadcast to all clients (including public pages)
        io.emit('song_ended');
      }
    });

    // Handle request for current song state
    socket.on('get_current_song', () => {
      logger.info(`[Socket.io] Client requesting current song`);
      socket.emit('current_song', { song: currentlyPlayingSong });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`[Socket.io] Client disconnected: ${socket.id}`);

      // Clear active admin if this was the admin
      if (activeAdminSocket && activeAdminSocket.id === socket.id) {
        const disconnectedUserId = activeAdminUserId;
        logger.info(`[Socket.io] Active admin session ended (user: ${activeAdminUserId})`);

        // DON'T clear currentlyPlayingSong and lastPlayedSongData here
        // because admin might be refreshing (reconnecting)
        // Only clear these when explicitly stopped or song ended

        // Clear socket but KEEP user ID for a short time (to handle refresh)
        activeAdminSocket = null;
        // DON'T clear activeAdminUserId immediately - keep it for refresh detection

        // Clear user ID after 5 seconds (enough time for refresh)
        setTimeout(() => {
          if (activeAdminSocket === null && activeAdminUserId === disconnectedUserId) {
            logger.info(`[Socket.io] Clearing admin user ID after timeout (user: ${disconnectedUserId})`);
            activeAdminUserId = null;
            activeAdminSessionId = null;

            // Also clear playback data if admin hasn't reconnected after 5 seconds
            // (means they actually closed the tab, not just refreshed)
            currentlyPlayingSong = null;
            lastPlayedSongData = null;
            logger.info(`[Socket.io] Cleared playback data - admin did not reconnect`);
          }
        }, 5000);
      }
    });
  });

  // Return io instance for use in routes/services
  return io;
}

// Export function to check if socket is active admin
function isActiveAdmin(socketId) {
  return activeAdminSocket && activeAdminSocket.id === socketId;
}

// Export function to get currently playing song
function getCurrentSong() {
  return currentlyPlayingSong;
}

// Export function to clear playback data (for stop/reset)
function clearPlaybackData() {
  currentlyPlayingSong = null;
  lastPlayedSongData = null;
  logger.info('[Socket.io] Cleared playback data (stop/reset)');
}

module.exports = setupSocket;
module.exports.isActiveAdmin = isActiveAdmin;
module.exports.getCurrentSong = getCurrentSong;
module.exports.clearPlaybackData = clearPlaybackData;
