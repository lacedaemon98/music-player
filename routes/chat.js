const express = require('express');
const router = express.Router();
const { Message, User, sequelize } = require('../models');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { ipUserMiddleware } = require('../middleware/ipUser');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Get recent messages (last 3 days, max 50)
router.get('/messages', async (req, res) => {
  try {
    // Get messages from last 3 days only
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const messages = await Message.findAll({
      where: {
        created_at: {
          [Op.gte]: threeDaysAgo
        }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'display_name', 'username']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: 50
    });

    // Reverse to show oldest first
    messages.reverse();

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        // Use current display_name from user, fallback to stored username if user not found
        username: m.user ? (m.user.display_name || m.user.username) : m.username,
        message: m.message,
        created_at: m.created_at
      }))
    });
  } catch (error) {
    logger.error('[Chat] Error getting messages:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi load tin nhắn'
    });
  }
});

// Send new message (authenticated users + IP-based users)
router.post('/messages', ipUserMiddleware, async (req, res) => {
  try {
    logger.info(`[Chat] Route handler entered. req.user = ${req.user ? req.user.username : 'NULL'}`);

    // Ensure we have a user (from ipUserMiddleware)
    if (!req.user) {
      logger.error('[Chat] No user after ipUserMiddleware');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    logger.info(`[Chat] User verified: ${req.user.username} (ID: ${req.user.id})`);

    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tin nhắn không được để trống bạn êi'
      });
    }

    if (message.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Tin nhắn dài quá bạn ơi. Tối đa 500 ký tự thôi'
      });
    }

    const newMessage = await Message.create({
      user_id: req.user.id,
      username: req.user.display_name || req.user.username,
      message: message.trim()
    });

    logger.info(`[Chat] New message from ${req.user.username}: ${message.substring(0, 50)}...`);

    // Broadcast new message to all clients via Socket.io
    const io = req.app.get('io');
    io.emit('new_message', {
      id: newMessage.id,
      username: newMessage.username,
      message: newMessage.message,
      created_at: newMessage.created_at
    });

    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    logger.error('[Chat] Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi gửi tin nhắn rồi bạn ơi'
    });
  }
});

// Delete message (admin only)
router.delete('/messages/:id', isAdmin, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tin nhắn này'
      });
    }

    await message.destroy();
    logger.info(`[Chat] Admin ${req.user.username} deleted message ${messageId}`);

    // Broadcast delete event
    const io = req.app.get('io');
    io.emit('message_deleted', { id: messageId });

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('[Chat] Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi xóa tin nhắn rồi'
    });
  }
});

// Cleanup old messages (older than 3 days) - called by scheduler
router.post('/cleanup', async (req, res) => {
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

    logger.info(`[Chat] Cleanup: Deleted ${result} old messages`);

    res.json({
      success: true,
      deleted: result
    });
  } catch (error) {
    logger.error('[Chat] Error cleaning up messages:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi cleanup'
    });
  }
});

module.exports = router;
