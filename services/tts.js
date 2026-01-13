const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const TTS_CACHE_DIR = path.join(__dirname, '../data/tts-cache');

// Ensure cache directory exists
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
  logger.info('[TTS] Created cache directory:', TTS_CACHE_DIR);
}

/**
 * Generate cache key from text
 */
function generateCacheKey(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Convert text to speech using Google Cloud TTS REST API with API key
 * @param {string} text - Text to convert
 * @param {number} songId - Song ID for cache filename
 * @returns {Promise<string|null>} - Path to generated audio file, or null if failed
 */
async function textToSpeechGenerate(text, songId) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      logger.warn('[TTS] No API key found, TTS will be disabled');
      return null;
    }

    const cacheKey = generateCacheKey(text);
    const cachedFilePath = path.join(TTS_CACHE_DIR, `${songId}-${cacheKey}.mp3`);

    // Check cache
    if (fs.existsSync(cachedFilePath)) {
      logger.info('[TTS] Using cached TTS file:', cachedFilePath);
      return cachedFilePath;
    }

    logger.info('[TTS] Generating new TTS audio for song:', songId);

    // Call Google Cloud Text-to-Speech REST API
    const response = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        input: { text },
        voice: {
          languageCode: 'vi-VN',
          name: 'vi-VN-Wavenet-A', // Female Vietnamese voice
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Decode base64 audio content
    const audioContent = Buffer.from(response.data.audioContent, 'base64');
    fs.writeFileSync(cachedFilePath, audioContent, 'binary');
    logger.info('[TTS] Generated and cached TTS audio:', cachedFilePath);

    return cachedFilePath;
  } catch (error) {
    logger.error('[TTS] Error generating speech:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { textToSpeech: textToSpeechGenerate };
