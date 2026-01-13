const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { User } = require('../models');
const { ipUserMiddleware } = require('../middleware/ipUser');

// Login
router.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      display_name: req.user.display_name,
      is_admin: req.user.is_admin
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout lỗi rồi bạn ơi' });
    }
    res.json({ success: true });
  });
});

// Get current user (supports both authenticated and IP-based users)
router.get('/me', ipUserMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập mà bạn'
      });
    }

    // Check and reset votes and song adds if new day
    await req.user.checkAndResetVotes();
    await req.user.checkAndResetAdds();

    res.json({
      id: req.user.id,
      username: req.user.username,
      display_name: req.user.display_name,
      is_admin: req.user.is_admin,
      is_anonymous: req.user.is_anonymous,
      remaining_votes: req.user.getRemainingVotes(),
      remaining_adds: req.user.getRemainingAdds()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy thông tin user rồi'
    });
  }
});

// Update display name (for both authenticated and IP-based users)
router.post('/update-name', ipUserMiddleware, async (req, res) => {
  try {
    const { display_name } = req.body;

    if (!display_name || display_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ê để tên trống sao được bạn êi'
      });
    }

    if (display_name.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Tên dài quá bạn. Ngắn lại đi (max 50 ký tự)'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy bạn đâu hết :<'
      });
    }

    // Update display name
    req.user.display_name = display_name.trim();
    await req.user.save();

    res.json({
      success: true,
      display_name: req.user.display_name,
      message: 'Đã đổi tên rồi nè ✨'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi rồi, đổi tên không được'
    });
  }
});

// Update nickname (alias for update-name, used by public page)
router.post('/nickname', ipUserMiddleware, async (req, res) => {
  try {
    const { display_name } = req.body;

    if (!display_name || display_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Ê để biệt danh trống sao được'
      });
    }

    if (display_name.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Biệt danh dài quá (max 50 ký tự thôi)'
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy bạn đâu hết :<'
      });
    }

    // Update display name
    req.user.display_name = display_name.trim();
    await req.user.save();

    res.json({
      success: true,
      display_name: req.user.display_name,
      message: 'Đã đổi biệt danh rồi đó 🎉'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi rồi, đổi biệt danh không được'
    });
  }
});

module.exports = router;
