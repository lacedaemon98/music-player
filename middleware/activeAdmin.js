const logger = require('../utils/logger');

/**
 * Middleware to ensure only the active admin session can control playback
 * This prevents multiple admin tabs from causing conflicts
 */
function ensureActiveAdmin(req, res, next) {
  // This middleware should be used after isAdmin middleware
  // It prevents stale admin tabs from sending commands

  // Note: We can't easily check socket ID from HTTP request
  // So we'll rely on the single admin socket enforcement in socket/index.js
  // This is just a documentation placeholder for now

  // The real protection is:
  // 1. Only one admin socket can be connected at a time (socket/index.js)
  // 2. Old tabs get disabled immediately when new tab connects (admin.ejs)

  next();
}

module.exports = { ensureActiveAdmin };
