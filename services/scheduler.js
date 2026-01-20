const schedule = require('node-schedule');
const { Schedule, Song, Message, sequelize } = require('../models');
const { Op } = require('sequelize');
const youtubeService = require('./youtube');
const offlineMusicService = require('./offlineMusic');
const logger = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.jobs = new Map(); // Map of schedule_id -> Job
    this.preDownloadJobs = new Map(); // Map of schedule_id -> Pre-download Job
    this.scheduledSongs = new Map(); // Map of schedule_id -> { song, streamUrl, announcementData }
    this.io = null; // Socket.io instance
    this.remainingSongsInSchedule = 0; // Track remaining songs in current schedule execution
    this.nextSongPrepared = null; // Pre-fetched next song in schedule: { song, streamUrl, announcementData, isOffline }
  }

  /**
   * Set Socket.io instance for broadcasting events
   */
  setSocketIO(io) {
    this.io = io;
    logger.info('[Scheduler] Socket.io instance set');
  }

  /**
   * Initialize scheduler - load all active schedules
   */
  async initialize() {
    try {
      logger.info('[Scheduler] Initializing...');

      const schedules = await Schedule.findAll({
        where: { is_active: true }
      });

      for (const sched of schedules) {
        await this.addJob(sched);
      }

      logger.info(`[Scheduler] Initialized with ${schedules.length} active schedules`);

      // Setup daily cleanup job for old chat messages (every day at 3 AM)
      schedule.scheduleJob('0 3 * * *', async () => {
        logger.info('[Scheduler] Running daily chat cleanup...');
        await this.cleanupOldMessages();
      });

      logger.info('[Scheduler] Daily chat cleanup job scheduled for 3 AM');

      // Run cleanup once on startup
      await this.cleanupOldMessages();
    } catch (error) {
      logger.error('[Scheduler] Initialization error:', error);
    }
  }

  /**
   * Cleanup chat messages older than 3 days
   */
  async cleanupOldMessages() {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const result = await Message.destroy({
        where: {
          created_at: {
            [Op.lt]: threeDaysAgo
          }
        }
      });

      if (result > 0) {
        logger.info(`[Scheduler] Cleanup: Deleted ${result} old chat messages`);
      }
    } catch (error) {
      logger.error('[Scheduler] Error cleaning up messages:', error);
    }
  }

  /**
   * Add or update a scheduled job
   */
  async addJob(scheduleRecord) {
    try {
      // Cancel existing job if any
      this.removeJob(scheduleRecord.id);

      // Create new cron job using node-schedule
      const job = schedule.scheduleJob(scheduleRecord.cron_expression, async () => {
        logger.info(`[Scheduler] Cron job triggered for schedule: ${scheduleRecord.name}`);
        await this.executeSchedule(scheduleRecord.id, scheduleRecord.volume, scheduleRecord.song_count);
      });

      if (!job) {
        throw new Error(`Failed to create cron job for schedule ${scheduleRecord.id}`);
      }

      this.jobs.set(scheduleRecord.id, job);

      // Create pre-download job (5 minutes before main schedule)
      const preDownloadJob = this.createPreDownloadJob(scheduleRecord);
      if (preDownloadJob) {
        this.preDownloadJobs.set(scheduleRecord.id, preDownloadJob);
      }

      // Calculate and save next run time
      const nextRun = job.nextInvocation();
      await Schedule.update(
        { next_run: nextRun ? nextRun.toDate() : null },
        { where: { id: scheduleRecord.id } }
      );

      logger.info(`[Scheduler] Added job for schedule "${scheduleRecord.name}" (${scheduleRecord.cron_expression}), next run: ${nextRun}`);

      return true;
    } catch (error) {
      logger.error(`[Scheduler] Error adding job for schedule ${scheduleRecord.id}:`, error);
      return false;
    }
  }

  /**
   * Create pre-download job (5 minutes before main schedule)
   */
  createPreDownloadJob(scheduleRecord) {
    try {
      // Parse cron expression to calculate 5 minutes earlier
      const cronParts = scheduleRecord.cron_expression.split(' ');

      // For simplicity, if it's a simple cron (minute hour * * *), subtract 5 minutes
      // Otherwise, use a RecurrenceRule
      const Recurrence = schedule.RecurrenceRule;
      const rule = new Recurrence();

      // Parse the cron expression
      // Format: minute hour day month dayOfWeek
      if (cronParts.length >= 5) {
        const [minute, hour, day, month, dayOfWeek] = cronParts;

        // Set hour
        if (hour !== '*') {
          rule.hour = parseInt(hour);
        }

        // Set minute (5 minutes before)
        if (minute !== '*') {
          let preDownloadMinute = parseInt(minute) - 5;
          if (preDownloadMinute < 0) {
            preDownloadMinute += 60;
            if (rule.hour !== null) {
              rule.hour = (rule.hour - 1 + 24) % 24;
            }
          }
          rule.minute = preDownloadMinute;
        } else {
          // Can't calculate pre-download for wildcard minutes
          logger.warn(`[Scheduler] Cannot create pre-download job for wildcard minute schedule: ${scheduleRecord.id}`);
          return null;
        }

        // Set day, month, dayOfWeek if specified
        if (day !== '*') rule.date = parseInt(day);
        if (month !== '*') rule.month = parseInt(month) - 1; // 0-indexed
        if (dayOfWeek !== '*') {
          // Handle comma-separated dayOfWeek (e.g., "0,1,2,3,4,5,6")
          if (dayOfWeek.includes(',')) {
            rule.dayOfWeek = dayOfWeek.split(',').map(d => parseInt(d.trim()));
          } else {
            rule.dayOfWeek = parseInt(dayOfWeek);
          }
        }
      } else {
        logger.warn(`[Scheduler] Invalid cron expression for pre-download: ${scheduleRecord.cron_expression}`);
        return null;
      }

      const preDownloadJob = schedule.scheduleJob(rule, async () => {
        logger.info(`[Scheduler] Pre-download job triggered for schedule: ${scheduleRecord.name}`);
        await this.prepareScheduledSong(scheduleRecord.id, scheduleRecord.volume, scheduleRecord.song_count);
      });

      logger.info(`[Scheduler] Created pre-download job for schedule "${scheduleRecord.name}" (5 min before)`);
      return preDownloadJob;

    } catch (error) {
      logger.error(`[Scheduler] Error creating pre-download job:`, error);
      return null;
    }
  }

  /**
   * Remove a scheduled job
   */
  removeJob(scheduleId) {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.cancel();
      this.jobs.delete(scheduleId);
      logger.info(`[Scheduler] Removed job for schedule ${scheduleId}`);
    }

    const preDownloadJob = this.preDownloadJobs.get(scheduleId);
    if (preDownloadJob) {
      preDownloadJob.cancel();
      this.preDownloadJobs.delete(scheduleId);
      logger.info(`[Scheduler] Removed pre-download job for schedule ${scheduleId}`);
    }

    // Clear cached song data
    this.scheduledSongs.delete(scheduleId);
  }

  /**
   * Prepare scheduled song (5 minutes before playback)
   * Lock top voted song, pre-download stream, generate announcement
   */
  async prepareScheduledSong(scheduleId, volume = 70, songCount = 1) {
    try {
      logger.info(`[Scheduler] Preparing scheduled song (schedule: ${scheduleId})`);

      const schedule = await Schedule.findByPk(scheduleId);
      if (!schedule || !schedule.is_active) {
        logger.warn(`[Scheduler] Schedule ${scheduleId} not found or inactive`);
        return;
      }

      // Get top voted song
      const topSong = await Song.getTopVoted();

      if (!topSong) {
        logger.warn('[Scheduler] No songs in queue for pre-download, will use offline music at schedule time');

        // Cache offline music flag
        this.scheduledSongs.set(scheduleId, {
          song: null,
          streamUrl: null,
          announcementData: null,
          isOffline: true
        });

        // Broadcast that offline music will be played
        if (this.io) {
          const nextRun = this.jobs.get(scheduleId)?.nextInvocation();
          const scheduleTime = nextRun ? nextRun.toDate().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null;
          this.io.emit('next_song_locked', {
            song: null,
            is_offline: true,
            schedule_id: scheduleId,
            schedule_name: schedule.name,
            schedule_time: scheduleTime
          });
        }

        return;
      }

      logger.info(`[Scheduler] Locked song for schedule: ${topSong.title} - ${topSong.artist}`);

      // IMPORTANT: Mark song as "played" temporarily to remove from queue
      // (Will be properly marked as played when actually played)
      await topSong.update({ played: true });

      // Pre-download YouTube stream URL
      let streamUrl = null;
      try {
        if (topSong.youtube_url) {
          logger.info('[Scheduler] Pre-downloading YouTube stream...');
          streamUrl = await youtubeService.getStreamUrl(topSong.youtube_url);
          logger.info('[Scheduler] YouTube stream pre-downloaded successfully');
        } else {
          throw new Error('No YouTube URL');
        }
      } catch (error) {
        logger.error('[Scheduler] YouTube stream pre-download failed:', error.message);
        logger.warn('[Scheduler] Will fallback to offline music at schedule time');

        // Restore song to queue (download failed)
        await topSong.update({ played: false });

        // Cache fallback to offline
        this.scheduledSongs.set(scheduleId, {
          song: null,
          streamUrl: null,
          announcementData: null,
          isOffline: true
        });

        // Broadcast fallback to offline (no song shown, just offline indicator)
        if (this.io) {
          const nextRun = this.jobs.get(scheduleId)?.nextInvocation();
          const scheduleTime = nextRun ? nextRun.toDate().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null;
          this.io.emit('next_song_locked', {
            song: null,
            download_failed: true,
            is_offline: true,
            schedule_id: scheduleId,
            schedule_name: schedule.name,
            schedule_time: scheduleTime
          });
          this.io.emit('queue_updated'); // Refresh queue
        }

        return;
      }

      // Generate DJ announcement if dedication message exists
      const djService = require('./dj');
      let announcementData = null;

      if (topSong.dedication_message) {
        try {
          logger.info('[Scheduler] Pre-generating DJ announcement for:', topSong.title);
          announcementData = await djService.generateAnnouncement(topSong);
          logger.info('[Scheduler] DJ announcement pre-generated successfully');
        } catch (error) {
          logger.error('[Scheduler] Announcement generation failed:', error);
        }
      }

      // Cache everything for playback
      this.scheduledSongs.set(scheduleId, {
        song: topSong,
        streamUrl: streamUrl,
        announcementData: announcementData,
        isOffline: false
      });

      logger.info(`[Scheduler] Song prepared successfully: ${topSong.title}`);

      // Get next run time (only time, not full date)
      const nextRun = this.jobs.get(scheduleId)?.nextInvocation();
      const scheduleTime = nextRun ? nextRun.toDate().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      }) : null;

      // Broadcast "next song" to all clients (show in queue)
      // ONLY AFTER successful download and ready to play
      if (this.io) {
        logger.info(`[Scheduler] ✓ Ready to broadcast - Song downloaded and cached`);
        logger.info(`[Scheduler] ✓ Stream URL ready: ${!!streamUrl}`);
        logger.info(`[Scheduler] ✓ Announcement ready: ${!!announcementData}`);

        this.io.emit('next_song_locked', {
          song: topSong.toJSON(),
          has_announcement: !!announcementData,
          schedule_id: scheduleId,
          schedule_name: schedule.name,
          schedule_time: scheduleTime
        });

        // Refresh queue to remove locked song
        this.io.emit('queue_updated');

        logger.info(`[Scheduler] ✓ Broadcasted next_song_locked to all clients`);
      }

    } catch (error) {
      logger.error(`[Scheduler] Error preparing scheduled song:`, error);

      // Cache offline fallback
      this.scheduledSongs.set(scheduleId, {
        song: null,
        streamUrl: null,
        announcementData: null,
        isOffline: true
      });
    }
  }

  /**
   * Execute scheduled playback
   * This is THE CRITICAL FEATURE - Socket.io broadcast from scheduler!
   */
  async executeSchedule(scheduleId, volume = 70, songCount = 1) {
    try {
      logger.info(`[Scheduler] Executing schedule ${scheduleId}, volume: ${volume}, songs: ${songCount}`);

      const schedule = await Schedule.findByPk(scheduleId);
      if (!schedule || !schedule.is_active) {
        logger.warn(`[Scheduler] Schedule ${scheduleId} not found or inactive`);
        return;
      }

      // Check if schedule was already executed recently (within last 10 minutes)
      // This happens when admin triggers "Next" with a locked song
      if (schedule.last_run) {
        const now = new Date();
        const lastRun = new Date(schedule.last_run);
        const minutesSinceLastRun = (now - lastRun) / (1000 * 60);

        if (minutesSinceLastRun < 10) {
          logger.info(`[Scheduler] Schedule ${scheduleId} was already executed ${minutesSinceLastRun.toFixed(1)} minutes ago (admin early trigger). Skipping.`);

          // Still update next_run for future schedules
          const job = this.jobs.get(scheduleId);
          if (job) {
            const nextInvocation = job.nextInvocation();
            const newNextRun = nextInvocation ? nextInvocation.toDate() : null;
            await Schedule.update(
              { next_run: newNextRun },
              { where: { id: scheduleId } }
            );
            logger.info(`[Scheduler] Updated next_run for schedule ${scheduleId}: ${newNextRun}`);
          }

          return; // Skip execution
        }
      }

      // Update last run time
      schedule.last_run = new Date();
      await schedule.save();

      // Check if we have pre-downloaded song
      const preparedData = this.scheduledSongs.get(scheduleId);

      // Set remaining songs counter (excluding first song)
      this.remainingSongsInSchedule = Math.max(0, songCount - 1);
      logger.info(`[Scheduler] Starting schedule with ${songCount} songs (${this.remainingSongsInSchedule} remaining after first)`);

      if (preparedData) {
        logger.info('[Scheduler] Using pre-downloaded song data');

        // Play first song using cached data
        // auto_next = true if there are more songs to play
        await this.playPreparedSong(preparedData, volume, this.remainingSongsInSchedule > 0);

        // Clear cache after use
        this.scheduledSongs.delete(scheduleId);
      } else {
        // Fallback to old behavior if no pre-download
        logger.warn('[Scheduler] No pre-downloaded data, using fallback');

        // Play first song with auto_next = true if there are more songs
        await this.playTopSong(volume, this.remainingSongsInSchedule > 0);
      }

      // Start pre-fetching next song if there are more songs to play
      if (this.remainingSongsInSchedule > 0) {
        logger.info('[Scheduler] Starting pre-fetch for second song in schedule...');
        // Don't await - run in background while first song is playing
        this.prepareNextSongInSchedule(volume).catch(err => {
          logger.error('[Scheduler] Background pre-fetch failed:', err);
        });
      }

      // Update next_run to the next occurrence after execution completes
      const job = this.jobs.get(scheduleId);
      if (job) {
        const nextInvocation = job.nextInvocation();
        const newNextRun = nextInvocation ? nextInvocation.toDate() : null;
        await Schedule.update(
          { next_run: newNextRun },
          { where: { id: scheduleId } }
        );
        logger.info(`[Scheduler] Updated next_run for schedule ${scheduleId}: ${newNextRun}`);
      }

      logger.info(`[Scheduler] Schedule ${scheduleId} executed successfully`);
    } catch (error) {
      logger.error(`[Scheduler] Error executing schedule ${scheduleId}:`, error);
    }
  }

  /**
   * Play pre-downloaded song (from cache)
   * @param {object} preparedData - Cached song data { song, streamUrl, announcementData, isOffline }
   * @param {number} volume - Volume level (0-100)
   * @param {boolean} autoNext - Whether to auto-play next song when current ends
   */
  async playPreparedSong(preparedData, volume, autoNext = true) {
    try {
      const { song, streamUrl, announcementData, isOffline } = preparedData;

      // If offline music fallback
      if (isOffline || !song) {
        logger.warn('[Scheduler] Playing offline music (pre-download failed or no queue)');

        const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

        if (!offlineMusic) {
          logger.warn('[Scheduler] No offline music available');
          return;
        }

        logger.info(`[Scheduler] Playing offline music: ${offlineMusic.title}`);

        const offlineStreamUrl = `/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`;

        if (this.io) {
          this.io.emit('play_song', {
            song: {
              id: null,
              title: offlineMusic.title,
              artist: 'Offline Music',
              thumbnail_url: '/images/offline-music.png'
            },
            stream_url: offlineStreamUrl,
            volume: volume,
            auto_next: autoNext
          });

          logger.info(`[Scheduler] Broadcasted offline music play event (auto_next: ${autoNext})`);
        } else {
          logger.error('[Scheduler] Socket.io not initialized!');
        }

        return;
      }

      // Mark song as played
      await song.markAsPlayed();

      logger.info(`[Scheduler] Playing pre-downloaded song: ${song.title} - ${song.artist}`);

      // Use cached stream URL or fallback to proxy
      const finalStreamUrl = streamUrl || `/api/playback/stream/${song.id}`;

      // Broadcast play event with cached announcement data
      if (this.io) {
        if (announcementData) {
          const payload = {
            song: song.toJSON(),
            announcement_text: announcementData.text,
            stream_url: finalStreamUrl,
            volume: volume,
            auto_next: autoNext
          };

          // Add audio URL if TTS audio was generated
          if (announcementData.audioPath) {
            const path = require('path');
            const filename = path.basename(announcementData.audioPath);
            payload.announcement_audio_url = `/api/playback/tts/audio/${filename}`;
            logger.info('[Scheduler] Broadcasting play_announcement with pre-generated audio');
          } else {
            logger.info('[Scheduler] Broadcasting play_announcement with text (Web Speech fallback)');
          }

          this.io.emit('play_announcement', payload);
        } else {
          this.io.emit('play_song', {
            song: song.toJSON(),
            stream_url: finalStreamUrl,
            volume: volume,
            auto_next: autoNext
          });
        }

        // Broadcast queue and recently played updates
        this.io.emit('queue_updated');
        this.io.emit('recently_played_updated');

        logger.info(`[Scheduler] Broadcasted play event for pre-downloaded song (auto_next: ${autoNext})`);
      } else {
        logger.error('[Scheduler] Socket.io not initialized!');
      }
    } catch (error) {
      logger.error('[Scheduler] Error playing prepared song:', error);
      throw error;
    }
  }

  /**
   * Play the top voted song from queue
   * @param {number} volume - Volume level (0-100)
   * @param {boolean} autoNext - Whether to auto-play next song when current ends
   */
  async playTopSong(volume, autoNext = true) {
    try {
      // Get top voted song
      const topSong = await Song.getTopVoted();

      // If no songs in queue, try offline music
      if (!topSong) {
        logger.warn('[Scheduler] No songs in queue, trying offline music');

        const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

        if (!offlineMusic) {
          logger.warn('[Scheduler] No offline music available');
          return;
        }

        // Play offline music
        logger.info(`[Scheduler] Playing offline music: ${offlineMusic.title}`);

        const streamUrl = `/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`;

        if (this.io) {
          this.io.emit('play_song', {
            song: {
              id: null,
              title: offlineMusic.title,
              artist: 'Offline Music',
              thumbnail_url: '/images/offline-music.png'
            },
            stream_url: streamUrl,
            volume: volume,
            auto_next: autoNext
          });

          logger.info(`[Scheduler] Broadcasted offline music play event (auto_next: ${autoNext})`);
        } else {
          logger.error('[Scheduler] Socket.io not initialized!');
        }

        return;
      }

      // Use server proxy endpoint instead of direct YouTube URL
      const streamUrl = `/api/playback/stream/${topSong.id}`;

      // Mark song as played
      await topSong.markAsPlayed();

      logger.info(`[Scheduler] Playing song: ${topSong.title} - ${topSong.artist}`);

      // Generate DJ announcement if dedication message exists
      const djService = require('./dj');
      let announcementData = null;

      if (topSong.dedication_message) {
        try {
          logger.info('[Scheduler] Generating DJ announcement for:', topSong.title);
          announcementData = await djService.generateAnnouncement(topSong);
        } catch (error) {
          logger.error('[Scheduler] Announcement generation failed, continuing without it:', error);
        }
      }

      // THIS IS THE KEY! Broadcast play event via Socket.io
      // This works in Node.js but failed in Flask!
      if (this.io) {
        // Broadcast appropriate event based on announcement availability
        if (announcementData) {
          const payload = {
            song: topSong.toJSON(),
            announcement_text: announcementData.text,
            stream_url: streamUrl,
            volume: volume,
            auto_next: autoNext
          };

          // Add audio URL if TTS audio was generated
          if (announcementData.audioPath) {
            const path = require('path');
            const filename = path.basename(announcementData.audioPath);
            payload.announcement_audio_url = `/api/playback/tts/audio/${filename}`;
            logger.info('[Scheduler] Broadcasting play_announcement with ElevenLabs audio');
          } else {
            logger.info('[Scheduler] Broadcasting play_announcement with text (Web Speech fallback)');
          }

          this.io.emit('play_announcement', payload);
        } else {
          this.io.emit('play_song', {
            song: topSong.toJSON(),
            stream_url: streamUrl,
            volume: volume,
            auto_next: autoNext
          });
        }

        // Also broadcast queue and recently played updates
        this.io.emit('queue_updated');
        this.io.emit('recently_played_updated');

        logger.info(`[Scheduler] Broadcasted play event (auto_next: ${autoNext})`);
      } else {
        logger.error('[Scheduler] Socket.io not initialized!');
      }
    } catch (error) {
      logger.error('[Scheduler] Error playing top song:', error);
      throw error;
    }
  }

  /**
   * Reload all schedules (useful after database changes)
   */
  async reload() {
    logger.info('[Scheduler] Reloading all schedules...');

    // Cancel all existing jobs
    for (const [scheduleId, job] of this.jobs.entries()) {
      job.cancel();
    }
    this.jobs.clear();

    // Reinitialize
    await this.initialize();
  }

  /**
   * Get status of all scheduled jobs
   */
  getStatus() {
    const status = [];
    for (const [scheduleId, job] of this.jobs.entries()) {
      const nextInvocation = job.nextInvocation();
      status.push({
        schedule_id: scheduleId,
        next_run: nextInvocation ? nextInvocation.toDate() : null
      });
    }
    return status;
  }

  /**
   * Get currently locked songs (for page refresh)
   * Returns array of locked song data with schedule info
   */
  async getLockedSongs() {
    const lockedSongs = [];

    for (const [scheduleId, preparedData] of this.scheduledSongs.entries()) {
      const schedule = await Schedule.findByPk(scheduleId);
      if (!schedule) continue;

      const nextRun = schedule.next_run ? new Date(schedule.next_run) : null;
      if (!nextRun) continue;

      const lockedSongData = {
        schedule_id: scheduleId,
        schedule_time: nextRun.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        is_offline: preparedData.isOffline || !preparedData.song,
        download_failed: preparedData.isOffline && preparedData.song === null
      };

      if (preparedData.song) {
        lockedSongData.song = preparedData.song.toJSON ? preparedData.song.toJSON() : preparedData.song;
        lockedSongData.has_announcement = !!preparedData.announcementData;
      }

      lockedSongs.push(lockedSongData);
    }

    return lockedSongs;
  }

  /**
   * Check if there are remaining songs in current schedule execution
   * If yes, decrement counter and return true
   * @returns {boolean} - true if should play next song in schedule, false otherwise
   */
  shouldPlayNextInSchedule() {
    if (this.remainingSongsInSchedule > 0) {
      this.remainingSongsInSchedule--;
      logger.info(`[Scheduler] Playing next song in schedule (${this.remainingSongsInSchedule} remaining after this)`);
      return true;
    }
    return false;
  }

  /**
   * Get remaining songs count in current schedule
   * @returns {number} - remaining songs count
   */
  getRemainingScheduleSongs() {
    return this.remainingSongsInSchedule;
  }

  /**
   * Reset remaining songs counter (called when admin manually plays or stops)
   */
  resetScheduleSongsCounter() {
    if (this.remainingSongsInSchedule > 0) {
      logger.info(`[Scheduler] Resetting schedule counter (was ${this.remainingSongsInSchedule})`);
      this.remainingSongsInSchedule = 0;
    }
    // Clear pre-fetched song
    this.nextSongPrepared = null;
  }

  /**
   * Pre-fetch next song in schedule while current song is playing
   * Called when first song starts playing and there are more songs to come
   */
  async prepareNextSongInSchedule(volume) {
    try {
      if (this.remainingSongsInSchedule === 0) {
        logger.info('[Scheduler] No remaining songs, skipping prepare');
        return;
      }

      logger.info('[Scheduler] Pre-fetching next song in schedule...');

      // Get top voted song
      const topSong = await Song.getTopVoted();

      if (!topSong) {
        logger.warn('[Scheduler] No song in queue for pre-fetch, will use offline music');
        this.nextSongPrepared = { isOffline: true, song: null };
        return;
      }

      logger.info(`[Scheduler] Pre-fetching: ${topSong.title} - ${topSong.artist}`);

      // Generate announcement if dedication exists
      let announcementData = null;
      if (topSong.dedication_message) {
        try {
          const djService = require('./dj');
          announcementData = await djService.generateAnnouncement(topSong);
          logger.info('[Scheduler] Pre-fetched announcement');
        } catch (error) {
          logger.error('[Scheduler] Announcement pre-fetch failed:', error);
        }
      }

      // Pre-extract stream URL
      let streamUrl = `/api/playback/stream/${topSong.id}`;
      if (topSong.youtube_url) {
        try {
          const youtubeService = require('./youtube');
          streamUrl = await youtubeService.getStreamUrl(topSong.youtube_url);
          logger.info('[Scheduler] Pre-extracted stream URL');
        } catch (error) {
          logger.error('[Scheduler] Stream URL pre-fetch failed, will use proxy:', error.message);
        }
      }

      // Store prepared data
      this.nextSongPrepared = {
        song: topSong,
        streamUrl: streamUrl,
        announcementData: announcementData,
        isOffline: false
      };

      logger.info('[Scheduler] Next song pre-fetch completed successfully');
    } catch (error) {
      logger.error('[Scheduler] Error pre-fetching next song:', error);
      this.nextSongPrepared = null;
    }
  }

  /**
   * Get prepared next song (if available)
   * Returns null if not prepared
   */
  getNextSongPrepared() {
    return this.nextSongPrepared;
  }

  /**
   * Clear prepared next song
   */
  clearNextSongPrepared() {
    this.nextSongPrepared = null;
  }

  /**
   * Play next song in schedule using pre-fetched data if available
   * Falls back to offline music if song failed to download
   */
  async playNextSongInSchedule(volume, autoNext = true) {
    try {
      // Check if we have pre-fetched song
      const preparedData = this.nextSongPrepared;
      this.nextSongPrepared = null; // Clear after use

      if (preparedData) {
        logger.info('[Scheduler] Using pre-fetched song data');

        // If pre-fetch failed (offline fallback)
        if (preparedData.isOffline || !preparedData.song) {
          logger.warn('[Scheduler] Pre-fetch failed, playing offline music');

          const offlineMusic = await offlineMusicService.getRandomOfflineMusic();

          if (!offlineMusic) {
            logger.error('[Scheduler] No offline music available');
            return;
          }

          const streamUrl = `/api/playback/stream-offline/${encodeURIComponent(offlineMusic.filename)}`;

          if (this.io) {
            this.io.emit('play_song', {
              song: {
                id: null,
                title: offlineMusic.title,
                artist: 'Offline Music',
                thumbnail_url: '/images/offline-music.png'
              },
              stream_url: streamUrl,
              volume: volume,
              auto_next: autoNext
            });
          }

          return;
        }

        // Play pre-fetched song
        const { song, streamUrl, announcementData } = preparedData;

        // Mark song as played
        await song.markAsPlayed();

        logger.info(`[Scheduler] Playing pre-fetched song: ${song.title}`);

        // Broadcast play event
        if (this.io) {
          if (announcementData) {
            const payload = {
              song: song.toJSON ? song.toJSON() : song,
              announcement_text: announcementData.text,
              stream_url: streamUrl,
              volume: volume,
              auto_next: autoNext
            };

            if (announcementData.audioPath) {
              const path = require('path');
              const filename = path.basename(announcementData.audioPath);
              payload.announcement_audio_url = `/api/playback/tts/audio/${filename}`;
            }

            this.io.emit('play_announcement', payload);
          } else {
            this.io.emit('play_song', {
              song: song.toJSON ? song.toJSON() : song,
              stream_url: streamUrl,
              volume: volume,
              auto_next: autoNext
            });
          }

          this.io.emit('queue_updated');
          this.io.emit('recently_played_updated');
        }

        // Start pre-fetching next song if there are more songs
        if (this.remainingSongsInSchedule > 0) {
          logger.info('[Scheduler] Starting pre-fetch for next song...');
          // Don't await - run in background
          this.prepareNextSongInSchedule(volume).catch(err => {
            logger.error('[Scheduler] Background pre-fetch failed:', err);
          });
        }

        return;
      }

      // No pre-fetched data - fallback to normal flow
      logger.warn('[Scheduler] No pre-fetched data, using normal flow');
      await this.playTopSong(volume, autoNext);

      // Start pre-fetching next song if there are more songs
      if (this.remainingSongsInSchedule > 0) {
        logger.info('[Scheduler] Starting pre-fetch for next song...');
        this.prepareNextSongInSchedule(volume).catch(err => {
          logger.error('[Scheduler] Background pre-fetch failed:', err);
        });
      }
    } catch (error) {
      logger.error('[Scheduler] Error playing next song in schedule:', error);
    }
  }
}

// Singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
