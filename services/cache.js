const logger = require('../utils/logger');

/**
 * Simple in-memory cache with TTL (Time To Live)
 * Used to cache stream URLs and playback data to reduce repeated API calls
 */
class CacheService {
  constructor() {
    // Cache structure: { key: { value, expiresAt } }
    this.cache = new Map();

    // Default TTL: 5 minutes (stream URLs expire after ~6 hours but we refresh sooner for safety)
    this.defaultTTL = 5 * 60 * 1000;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional, uses default if not provided)
   */
  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
    logger.info(`[Cache] Set key: ${key}, expires in ${ttl}ms`);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      logger.info(`[Cache] Key expired and removed: ${key}`);
      return null;
    }

    logger.info(`[Cache] Cache hit for key: ${key}`);
    return entry.value;
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.info(`[Cache] Deleted key: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    logger.info('[Cache] Cleared all cache entries');
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`[Cache] Cleanup removed ${removedCount} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
module.exports = new CacheService();
