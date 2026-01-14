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
 * Get unique browser fingerprint from request
 * Combines multiple factors for better uniqueness
 */
function getBrowserFingerprint(req) {
  // Check for custom client fingerprint header (sent from browser)
  const clientFingerprint = req.headers['x-client-fingerprint'];
  if (clientFingerprint) {
    return clientFingerprint;
  }

  // Fallback: Generate fingerprint from IP + User Agent
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const crypto = require('crypto');

  // Hash combination of IP and User Agent
  const hash = crypto.createHash('md5')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .substring(0, 16);

  return hash;
}

/**
 * Middleware to create/load user from browser fingerprint
 * Anonymous users are identified by unique fingerprint, logged-in users keep their account
 */
async function ipUserMiddleware(req, res, next) {
  try {
    // If already authenticated (logged in admin), skip
    if (req.isAuthenticated() && req.user) {
      return next();
    }

    // Get unique browser fingerprint
    const fingerprint = getBrowserFingerprint(req);
    const ipAddress = getClientIp(req);
    logger.info(`[IP User] Request from fingerprint: ${fingerprint}, IP: ${ipAddress}`);

    // Find or create anonymous user by fingerprint (stored in username field)
    let user = await User.findOne({
      where: {
        username: `guest_${fingerprint}`,
        is_anonymous: true
      }
    });

    if (!user) {
      // Create new anonymous user
      // Anonymous users don't need real password, use a dummy hash
      user = await User.create({
        username: `guest_${fingerprint}`,
        display_name: `Guest ${fingerprint.substring(0, 6)}`,
        password_hash: 'ANONYMOUS_USER_NO_PASSWORD',
        is_anonymous: true,
        is_admin: false,
        ip_address: ipAddress, // Still store IP for reference
        last_seen: new Date()
      });
      logger.info(`[IP User] Created new anonymous user with fingerprint: ${fingerprint}`);
    } else {
      // Update last seen and IP (in case user changed network)
      user.last_seen = new Date();
      user.ip_address = ipAddress;
      await user.save();
    }

    // Attach user to request (like Passport does)
    req.user = user;
    req.ipAddress = ipAddress;
    req.fingerprint = fingerprint;

    logger.info(`[IP User] User attached to request: ${user.username} (ID: ${user.id})`);
    next();
  } catch (error) {
    logger.error('[IP User] Middleware error:', error);
    next(error);
  }
}

module.exports = { ipUserMiddleware, getClientIp, getBrowserFingerprint };
