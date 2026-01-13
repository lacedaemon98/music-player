const express = require('express');
const router = express.Router();
const { User } = require('../models');
const logger = require('../utils/logger');

// Claim admin rights
router.post('/claim', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Check if password is strong enough (at least 6 characters)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if any admin exists
    const adminCount = await User.count({ where: { is_admin: true } });

    if (adminCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Admin already exists'
      });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ where: { username } });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken'
      });
    }

    // Create admin user
    const passwordHash = await User.hashPassword(password);
    const admin = await User.create({
      username,
      display_name: username,
      password_hash: passwordHash,
      is_admin: true,
      is_anonymous: false
    });

    logger.info(`[Admin] Admin user created: ${username}`);

    // Auto-login the new admin
    req.login(admin, (err) => {
      if (err) {
        logger.error('[Admin] Auto-login failed:', err);
        return res.status(500).json({
          success: false,
          message: 'Admin created but auto-login failed'
        });
      }

      res.json({
        success: true,
        message: 'Admin claimed successfully',
        user: {
          id: admin.id,
          username: admin.username,
          display_name: admin.display_name,
          is_admin: admin.is_admin
        }
      });
    });
  } catch (error) {
    logger.error('[Admin] Error claiming admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim admin'
    });
  }
});

module.exports = router;
