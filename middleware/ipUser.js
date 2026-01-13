const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * Get client IP address from request
 */
function getClientIp(req) {
  // Check for proxy headers first
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  // Fallback to socket IP
  return req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.connection.socket.remoteAddress ||
         'unknown';
}

/**
 * Middleware to create/load user from IP address
 * Anonymous users are identified by IP, logged-in users keep their account
 */
async function ipUserMiddleware(req, res, next) {
  try {
    // If already authenticated (logged in admin), skip
    if (req.isAuthenticated() && req.user) {
      return next();
    }

    // Get client IP
    const ipAddress = getClientIp(req);
    logger.info(`[IP User] Request from IP: ${ipAddress}`);

    // Find or create anonymous user by IP
    let user = await User.findOne({
      where: {
        ip_address: ipAddress,
        is_anonymous: true
      }
    });

    if (!user) {
      // Create new anonymous user
      // Anonymous users don't need real password, use a dummy hash
      user = await User.create({
        username: `guest_${ipAddress.replace(/[.:]/g, '_')}`,
        display_name: `Guest ${ipAddress.slice(-8)}`,
        password_hash: 'ANONYMOUS_USER_NO_PASSWORD',
        is_anonymous: true,
        is_admin: false,
        ip_address: ipAddress,
        last_seen: new Date()
      });
      logger.info(`[IP User] Created new anonymous user for IP: ${ipAddress}`);
    } else {
      // Update last seen
      user.last_seen = new Date();
      await user.save();
    }

    // Attach user to request (like Passport does)
    req.user = user;
    req.ipAddress = ipAddress;

    logger.info(`[IP User] User attached to request: ${user.username} (ID: ${user.id})`);
    next();
  } catch (error) {
    logger.error('[IP User] Middleware error:', error);
    next(error);
  }
}

module.exports = { ipUserMiddleware, getClientIp };
