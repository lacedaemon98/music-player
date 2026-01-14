const geminiService = require('./gemini');
const ttsService = require('./tts');
const logger = require('../utils/logger');

/**
 * Generate DJ announcement with audio for a song with dedication message
 * @param {Object} song - Song object with id, title, artist, dedication_message
 * @returns {Promise<Object|null>} - { text, audioPath } or null if no message
 */
async function generateAnnouncement(song) {
  try {
    // Skip if no dedication message
    if (!song.dedication_message || song.dedication_message.trim() === '') {
      logger.info('[DJ] No dedication message, skipping announcement');
      return null;
    }

    logger.info(`[DJ] Generating announcement for song: ${song.title} (ID: ${song.id})`);

    // Generate DJ announcement text using Gemini
    const announcementText = await geminiService.generateDJAnnouncement(song);

    if (!announcementText) {
      logger.error('[DJ] Failed to generate announcement text');
      return null;
    }

    logger.info(`[DJ] Generated announcement text: "${announcementText.substring(0, 50)}..."`);

    // Generate TTS audio using ElevenLabs (if available)
    let audioPath = null;

    if (process.env.ELEVENLABS_API_KEY) {
      try {
        logger.info('[DJ] Generating TTS audio with ElevenLabs');
        audioPath = await ttsService.textToSpeech(announcementText, song.id);

        if (audioPath) {
          logger.info('[DJ] TTS audio generated successfully:', audioPath);
        } else {
          logger.warn('[DJ] TTS generation returned null, will use Web Speech API fallback');
        }
      } catch (ttsError) {
        logger.error('[DJ] TTS generation failed:', ttsError.message);
        logger.warn('[DJ] Will use Web Speech API fallback');
      }
    } else {
      logger.info('[DJ] No ElevenLabs API key, will use Web Speech API');
    }

    return {
      text: announcementText,
      audioPath: audioPath // null if TTS not available
    };

  } catch (error) {
    logger.error('[DJ] Error generating announcement:', error);
    return null; // Graceful degradation - playback will continue without announcement
  }
}

module.exports = { generateAnnouncement };
