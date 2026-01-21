const express = require('express');
const router = express.Router();
const { Schedule } = require('../models');
const { isAdmin } = require('../middleware/auth');
const schedulerService = require('../services/scheduler');
const logger = require('../utils/logger');

// Get currently locked songs (public)
router.get('/locked-song', async (req, res) => {
  try {
    const lockedSongs = await schedulerService.getLockedSongs();

    // Return the first locked song (should only be one at a time)
    if (lockedSongs.length > 0) {
      return res.json({
        success: true,
        locked_song: lockedSongs[0]
      });
    }

    res.json({
      success: true,
      locked_song: null
    });
  } catch (error) {
    logger.error('[Schedules] Error getting locked song:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy bài đã chốt'
    });
  }
});

// Get next upcoming schedule (public)
router.get('/next', async (req, res) => {
  try {
    const now = new Date();
    const schedules = await Schedule.findAll({
      where: {
        is_active: true
      },
      order: [['next_run', 'ASC']]
    });

    // Find next schedule
    const nextSchedule = schedules.find(s => s.next_run && new Date(s.next_run) > now);

    if (!nextSchedule) {
      return res.json({
        success: true,
        schedule: null
      });
    }

    const nextRun = new Date(nextSchedule.next_run);
    const lockTime = new Date(nextRun.getTime() - 3 * 60 * 1000); // 3 minutes before

    // Determine if schedule is today, tomorrow, or another day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scheduleDate = new Date(nextRun);
    scheduleDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((scheduleDate - today) / (1000 * 60 * 60 * 24));

    let dayPrefix = '';
    if (diffDays === 0) {
      dayPrefix = ''; // Today - no prefix
    } else if (diffDays === 1) {
      dayPrefix = 'Ngày mai'; // Tomorrow
    } else {
      // Show day of week
      const daysOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      dayPrefix = daysOfWeek[nextRun.getDay()];
    }

    res.json({
      success: true,
      schedule: {
        id: nextSchedule.id,
        name: nextSchedule.name,
        next_run: nextRun.toISOString(),
        lock_time: lockTime.toISOString(),
        next_run_display: nextRun.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        lock_time_display: lockTime.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        day_prefix: dayPrefix,
        is_today: diffDays === 0
      }
    });
  } catch (error) {
    logger.error('[Schedules] Error getting next schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy lịch tiếp theo'
    });
  }
});

// Get all schedules (admin only)
router.get('/', isAdmin, async (req, res) => {
  try {
    const schedules = await Schedule.findAll({
      order: [['created_at', 'DESC']]
    });

    res.json({
      schedules: schedules.map(s => s.toJSON())
    });
  } catch (error) {
    logger.error('[Schedules] Error getting schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load danh sách lịch rồi'
    });
  }
});

// Create schedule (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const { name, cron_expression, volume, song_count } = req.body;

    if (!name || !cron_expression) {
      return res.status(400).json({
        success: false,
        message: 'Ê nhập đủ thông tin đi bạn'
      });
    }

    // Validate cron expression
    try {
      const parser = require('cron-parser');
      const interval = parser.parseExpression(cron_expression, {
        tz: 'Asia/Ho_Chi_Minh'
      });
      const nextRun = interval.next().toDate();

      const schedule = await Schedule.create({
        name,
        cron_expression,
        volume: volume || 70,
        song_count: song_count || 1,
        is_active: true,
        next_run: nextRun
      });

      // Add to scheduler
      await schedulerService.addJob(schedule);

      logger.info(`[Schedules] Schedule created: ${name}`);

      // Broadcast update
      const io = req.app.get('io');
      io.emit('schedule_updated');

      res.status(201).json({
        success: true,
        schedule: schedule.toJSON()
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Lịch phát này lỗi rồi bạn êi'
      });
    }
  } catch (error) {
    logger.error('[Schedules] Error creating schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi tạo lịch rồi bạn ơi'
    });
  }
});

// Update schedule (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch này đâu hết'
      });
    }

    const { name, cron_expression, volume, is_active, song_count } = req.body;

    if (name) schedule.name = name;
    if (volume !== undefined) schedule.volume = volume;
    if (is_active !== undefined) schedule.is_active = is_active;
    if (song_count !== undefined) schedule.song_count = song_count;

    if (cron_expression) {
      try {
        const parser = require('cron-parser');
        const interval = parser.parseExpression(cron_expression, {
          tz: 'Asia/Ho_Chi_Minh'
        });
        const nextRun = interval.next().toDate();

        schedule.cron_expression = cron_expression;
        schedule.next_run = nextRun;
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Lịch phát lỗi rồi bạn êi'
        });
      }
    }

    await schedule.save();

    // Update scheduler job
    if (schedule.is_active) {
      await schedulerService.addJob(schedule);
    } else {
      schedulerService.removeJob(schedule.id);
    }

    logger.info(`[Schedules] Schedule updated: ${schedule.name}`);

    // Broadcast update
    const io = req.app.get('io');
    io.emit('schedule_updated');

    res.json({
      success: true,
      schedule: schedule.toJSON()
    });
  } catch (error) {
    logger.error('[Schedules] Error updating schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi update lịch rồi bạn ơi'
    });
  }
});

// Delete schedule (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch này đâu hết'
      });
    }

    // Remove from scheduler first
    schedulerService.removeJob(schedule.id);

    await schedule.destroy();

    logger.info(`[Schedules] Schedule deleted: ${schedule.name}`);

    // Broadcast update
    const io = req.app.get('io');
    io.emit('schedule_updated');

    res.json({
      success: true,
      message: 'Đã xóa lịch rồi nha'
    });
  } catch (error) {
    logger.error('[Schedules] Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Xóa lịch lỗi rồi bạn ơi'
    });
  }
});

// Manually trigger a schedule (admin only)
router.post('/:id/trigger', isAdmin, async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch này đâu hết'
      });
    }

    // Execute schedule immediately
    await schedulerService.executeSchedule(schedule.id, schedule.volume, schedule.song_count);

    logger.info(`[Schedules] Manually triggered schedule: ${schedule.name}`);

    res.json({
      success: true,
      message: 'Đã chạy lịch thủ công rồi nha'
    });
  } catch (error) {
    logger.error('[Schedules] Error triggering schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi chạy lịch rồi bạn ơi'
    });
  }
});

module.exports = router;
