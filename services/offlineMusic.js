const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class OfflineMusicService {
  constructor() {
    this.offlineMusicDir = path.join(__dirname, '../data/offline-music');
    this.supportedFormats = ['.mp3', '.m4a', '.wav', '.ogg', '.flac'];
  }

  /**
   * Initialize offline music directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.offlineMusicDir, { recursive: true });
      logger.info('[OfflineMusic] Initialized offline music directory');
    } catch (error) {
      logger.error('[OfflineMusic] Failed to initialize directory:', error);
    }
  }

  /**
   * Get list of all offline music files
   */
  async getOfflineMusicList() {
    try {
      const files = await fs.readdir(this.offlineMusicDir);

      const musicFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return this.supportedFormats.includes(ext);
      });

      return musicFiles.map(file => ({
        filename: file,
        path: path.join(this.offlineMusicDir, file),
        title: this.extractTitle(file)
      }));
    } catch (error) {
      logger.error('[OfflineMusic] Error reading offline music directory:', error);
      return [];
    }
  }

  /**
   * Get a random offline music file
   */
  async getRandomOfflineMusic() {
    try {
      const musicList = await this.getOfflineMusicList();

      if (musicList.length === 0) {
        logger.warn('[OfflineMusic] No offline music files found');
        return null;
      }

      const randomIndex = Math.floor(Math.random() * musicList.length);
      const selectedMusic = musicList[randomIndex];

      logger.info(`[OfflineMusic] Selected random music: ${selectedMusic.title}`);

      return selectedMusic;
    } catch (error) {
      logger.error('[OfflineMusic] Error getting random offline music:', error);
      return null;
    }
  }

  /**
   * Extract title from filename (remove extension and clean up)
   */
  extractTitle(filename) {
    const nameWithoutExt = path.parse(filename).name;
    // Replace underscores/dashes with spaces and clean up
    return nameWithoutExt
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if offline music directory has any files
   */
  async hasOfflineMusic() {
    const musicList = await this.getOfflineMusicList();
    return musicList.length > 0;
  }
}

// Singleton instance
const offlineMusicService = new OfflineMusicService();

module.exports = offlineMusicService;
