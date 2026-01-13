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
   * Get audio stream URL (highest quality)
   */
  async getStreamUrl(url) {
    try {
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid YouTube URL');
      }

      const info = await ytdl.getInfo(url);

      // Get audio-only formats
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

      if (audioFormats.length === 0) {
        throw new Error('No audio format available');
      }

      // Sort by bitrate and get highest quality
      audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      const bestAudio = audioFormats[0];

      logger.info(`[YouTube] Stream URL obtained: ${bestAudio.audioBitrate}kbps`);
      return bestAudio.url;
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
      return ytdl.getVideoID(url);
    } catch (error) {
      return null;
    }
  }
}

module.exports = new YouTubeService();
