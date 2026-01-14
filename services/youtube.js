const logger = require('../utils/logger');
const { parseSongMetadata } = require('./song-parser');

class YouTubeService {
  /**
   * Validate YouTube URL
   */
  isValidUrl(url) {
    try {
      // Check if URL matches YouTube patterns
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
      return youtubeRegex.test(url);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get video info (title, artist, thumbnail, duration) using yt-dlp
   */
  async getVideoInfo(url) {
    try {
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid YouTube URL');
      }

      // Strip playlist parameters from URL to avoid issues
      let cleanUrl = url.split('&list=')[0].split('?list=')[0];

      // Use yt-dlp to get video info (more reliable than ytdl-core)
      const { execSync } = require('child_process');
      const result = execSync(
        `yt-dlp --dump-json --no-warnings "${cleanUrl}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000 // 30 second timeout
        }
      );

      const info = JSON.parse(result);

      // Use song parser to extract clean title and artist
      const parsed = await parseSongMetadata(info.title, info.uploader);

      return {
        title: parsed.title,
        artist: parsed.artist,
        thumbnail_url: info.thumbnail || '',
        duration: parseInt(info.duration) || 0,
        youtube_url: url,
        youtube_id: info.id
      };
    } catch (error) {
      logger.error('[YouTube] Error getting video info:', error.message);
      throw new Error('Không thể lấy thông tin video từ YouTube');
    }
  }

  /**
   * Get audio stream URL (highest quality) using yt-dlp
   */
  async getStreamUrl(url) {
    try {
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid YouTube URL');
      }

      // Strip playlist parameters
      let cleanUrl = url.split('&list=')[0].split('?list=')[0];

      // Use yt-dlp to get best audio stream URL
      const { execSync } = require('child_process');
      const result = execSync(
        `yt-dlp -f bestaudio --get-url "${cleanUrl}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 90000 // 90 second timeout for slow extraction
        }
      );

      const streamUrl = result.trim();

      if (!streamUrl || !streamUrl.startsWith('http')) {
        throw new Error('Invalid stream URL received');
      }

      logger.info(`[YouTube] Stream URL obtained successfully`);
      return streamUrl;
    } catch (error) {
      logger.error('[YouTube] Error getting stream URL:', error.message);
      throw new Error('Không thể lấy stream URL từ YouTube');
    }
  }

  /**
   * Get video ID from URL
   */
  getVideoId(url) {
    try {
      if (!this.isValidUrl(url)) {
        return null;
      }

      // Extract video ID from various YouTube URL formats
      const regexList = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
      ];

      for (const regex of regexList) {
        const match = url.match(regex);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = new YouTubeService();
