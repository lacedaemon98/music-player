const express = require('express');
const router = express.Router();
const { Schedule } = require('../models');
const { isAdmin } = require('../middleware/auth');
const schedulerService = require('../services/scheduler');
const logger = require('../utils/logger');

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
