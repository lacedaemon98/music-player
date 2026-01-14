const { ElevenLabsClient } = require('elevenlabs');
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

let client;

// Initialize ElevenLabs client
try {
  if (process.env.ELEVENLABS_API_KEY) {
    client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
    logger.info('[TTS] ElevenLabs client initialized successfully');
  } else {
    logger.warn('[TTS] No ELEVENLABS_API_KEY found, TTS will be disabled');
  }
} catch (error) {
  logger.error('[TTS] Failed to initialize ElevenLabs client:', error);
}

/**
 * Generate cache key from text
 */
function generateCacheKey(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Convert text to speech using ElevenLabs API
 * @param {string} text - Text to convert
 * @param {number} songId - Song ID for cache filename
 * @returns {Promise<string|null>} - Path to generated audio file, or null if failed
 */
async function textToSpeechGenerate(text, songId) {
  try {
    if (!client) {
      logger.warn('[TTS] ElevenLabs client not initialized');
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

    // List available voices to find Vietnamese voice
    // Vietnamese voice IDs in ElevenLabs:
    // - "onwK4e9ZLuTAKqWW03F9" (Adam - Multilingual)
    // - "pNInz6obpgDQGcFmaJgB" (Adam - Vietnamese optimized)
    // You can also use any multilingual voice

    const voiceId = 'onwK4e9ZLuTAKqWW03F9'; // Adam multilingual voice (works well with Vietnamese)

    // Generate audio using ElevenLabs streaming API
    const audioStream = await client.generate({
      voice: voiceId,
      text: text,
      model_id: 'eleven_multilingual_v2' // Best for Vietnamese
    });

    // Write stream to file
    const writeStream = fs.createWriteStream(cachedFilePath);

    return new Promise((resolve, reject) => {
      audioStream.pipe(writeStream);

      writeStream.on('finish', () => {
        logger.info('[TTS] Generated and cached TTS audio:', cachedFilePath);
        resolve(cachedFilePath);
      });

      writeStream.on('error', (error) => {
        logger.error('[TTS] Error writing audio file:', error);
        reject(error);
      });

      audioStream.on('error', (error) => {
        logger.error('[TTS] Error streaming audio:', error);
        reject(error);
      });
    });

  } catch (error) {
    logger.error('[TTS] Error generating speech:', error.message);
    return null;
  }
}

module.exports = { textToSpeech: textToSpeechGenerate };
