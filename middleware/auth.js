const { User } = require('../models');

// Ensure user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
}

// Ensure user is admin
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) {
    return next();
  }
  res.status(403).json({
    success: false,
    message: 'Admin access required'
  });
}

// Get or create anonymous user (for non-authenticated users)
async function getOrCreateAnonymousUser(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  const sessionId = req.sessionID;

  try {
    let user = await User.findOne({ where: { session_id: sessionId } });

    if (!user) {
      const anonymousName = `Guest_${Math.random().toString(36).substr(2, 6)}`;
      user = await User.create({
        username: `anon_${sessionId}`,
        display_name: anonymousName,
        password_hash: 'N/A',
        is_anonymous: true,
        session_id: sessionId
      });
    }

    // Update last seen
    user.last_seen = new Date();
    await user.save();

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Error creating anonymous user:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
}

module.exports = {
  isAuthenticated,
  isAdmin,
  getOrCreateAnonymousUser
};
