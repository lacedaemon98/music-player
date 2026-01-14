const schedule = require('node-schedule');
const { Schedule, Song, Message, sequelize } = require('../models');
const { Op } = require('sequelize');
const youtubeService = require('./youtube');
const offlineMusicService = require('./offlineMusic');
const logger = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.jobs = new Map(); // Map of schedule_id -> Job
    this.io = null; // Socket.io instance
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
   * Remove a scheduled job
   */
  removeJob(scheduleId) {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.cancel();
      this.jobs.delete(scheduleId);
      logger.info(`[Scheduler] Removed job for schedule ${scheduleId}`);
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

      // Update last run time
      schedule.last_run = new Date();
      await schedule.save();

      // Play multiple songs if requested
      for (let i = 0; i < songCount; i++) {
        // Only auto-next if this is NOT the last song
        const autoNext = (i < songCount - 1);
        await this.playTopSong(volume, autoNext);

        // Wait between songs if playing multiple (2 seconds)
        if (i < songCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      logger.info(`[Scheduler] Schedule ${scheduleId} executed successfully`);
    } catch (error) {
      logger.error(`[Scheduler] Error executing schedule ${scheduleId}:`, error);
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
}

// Singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
