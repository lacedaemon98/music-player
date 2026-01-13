const geminiService = require('./gemini');
const logger = require('../utils/logger');

/**
 * Generate DJ announcement text for a song with dedication message
 * Uses fallback templates (no API key required)
 * Frontend will use Web Speech API to speak the text
 *
 * @param {Object} song - Song object with id, title, artist, dedication_message
 * @returns {Promise<string|null>} - Announcement text, or null if no message
 */
async function generateAnnouncementText(song) {
  try {
    // Skip if no dedication message
    if (!song.dedication_message || song.dedication_message.trim() === '') {
      logger.info('[DJ] No dedication message, skipping announcement');
      return null;
    }

    logger.info(`[DJ] Generating announcement for song: ${song.title} (ID: ${song.id})`);

    // Generate DJ announcement text (always uses templates since we have no valid API key)
    const announcementText = await geminiService.generateDJAnnouncement(song);

    if (!announcementText) {
      logger.error('[DJ] Failed to generate announcement text');
      return null;
    }

    logger.info(`[DJ] Generated announcement text: "${announcementText.substring(0, 50)}..."`);
    return announcementText;

  } catch (error) {
    logger.error('[DJ] Error generating announcement:', error);
    return null; // Graceful degradation - playback will continue without announcement
  }
}

module.exports = { generateAnnouncementText };
