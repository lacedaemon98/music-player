const logger = require('../utils/logger');

// Track active admin session with user info
let activeAdminSocket = null;
let activeAdminUserId = null;
let activeAdminSessionId = null;

// Track currently playing song
let currentlyPlayingSong = null;

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

    // Handle song started notification from admin
    socket.on('song_started', (data) => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Song started: ${data.song.title}`);
        currentlyPlayingSong = data.song;
        // Only update server state - don't re-broadcast play_song (would cause infinite loop)
        // Public clients will get the song info via 'get_current_song' or when they load the page
        io.emit('song_playing_update', { song: data.song });
      }
    });

    // Handle song ended notification from admin
    socket.on('song_ended_notify', () => {
      if (socket.isAdmin && isActiveAdmin(socket.id)) {
        logger.info(`[Socket.io] Song ended, broadcasting to all clients`);
        // Clear currently playing song
        currentlyPlayingSong = null;
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

        // Clear currently playing song
        currentlyPlayingSong = null;
        logger.info(`[Socket.io] Cleared currently playing song due to admin disconnect`);

        // Clear socket but KEEP user ID for a short time (to handle refresh)
        activeAdminSocket = null;
        // DON'T clear activeAdminUserId immediately - keep it for refresh detection

        // Clear user ID after 5 seconds (enough time for refresh)
        setTimeout(() => {
          if (activeAdminSocket === null && activeAdminUserId === disconnectedUserId) {
            logger.info(`[Socket.io] Clearing admin user ID after timeout (user: ${disconnectedUserId})`);
            activeAdminUserId = null;
            activeAdminSessionId = null;
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

module.exports = setupSocket;
module.exports.isActiveAdmin = isActiveAdmin;
module.exports.getCurrentSong = getCurrentSong;
