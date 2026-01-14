const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;
let model;

// Initialize Gemini for song parsing
try {
  if (process.env.GOOGLE_AI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    logger.info('[SongParser] Gemini initialized for smart parsing with gemini-2.0-flash');
  }
} catch (error) {
  logger.warn('[SongParser] Gemini not available, will use rule-based parsing');
}

/**
 * Parse song title and artist using Gemini AI
 */
async function parseWithAI(youtubeTitle) {
  if (!model) return null;

  try {
    const prompt = `Phân tích tiêu đề video YouTube này và trả về tên bài hát và tên ca sĩ.

Tiêu đề: "${youtubeTitle}"

Yêu cầu:
- Xác định đâu là TÊN BÀI HÁT và đâu là TÊN CA SĨ
- Loại bỏ các từ như: (Official Video), (MV), (Lyric), [Official], hashtag, v.v.
- Trả về JSON format: {"title": "tên bài hát", "artist": "tên ca sĩ"}
- Chỉ trả về JSON, không thêm text khác

Ví dụ:
Input: "KHÚC HÁT MỪNG SINH NHẬT - PHAN ĐINH TÙNG ( OFFICIAL VIDEO)"
Output: {"title": "KHÚC HÁT MỪNG SINH NHẬT", "artist": "PHAN ĐINH TÙNG"}

Input: "Nơi Này Có Anh - Sơn Tùng M-TP | Official Music Video"
Output: {"title": "Nơi Này Có Anh", "artist": "Sơn Tùng M-TP"}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Extract JSON from response (handle cases where AI adds extra text)
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && parsed.artist) {
        logger.info(`[SongParser] AI parsed: "${youtubeTitle}" → Title: "${parsed.title}", Artist: "${parsed.artist}"`);
        return parsed;
      }
    }

    return null;
  } catch (error) {
    logger.warn('[SongParser] AI parsing failed:', error.message);
    return null;
  }
}

/**
 * Rule-based fallback parsing
 */
function parseWithRules(youtubeTitle, uploaderName) {
  let title = youtubeTitle;
  let artist = uploaderName || 'Unknown Artist';

  try {
    // Remove common YouTube spam
    title = title
      .replace(/\(official\s*(video|audio|music\s*video|mv|lyric(s)?)\)/gi, '')
      .replace(/\[official\s*(video|audio|music\s*video|mv|lyric(s)?)\]/gi, '')
      .replace(/official\s*(video|audio|music\s*video|mv)/gi, '')
      .replace(/\(.*?(lyric|audio|video).*?\)/gi, '')
      .replace(/\[.*?(lyric|audio|video).*?\]/gi, '')
      .replace(/【.*?】/g, '')
      .replace(/\|.*$/, '') // Remove everything after |
      .replace(/#\w+/g, '') // Remove hashtags
      .replace(/\s+/g, ' ')
      .trim();

    // Try to split by common separators
    const separators = [' - ', ' – ', ' | ', ' • ', ' _ '];
    let parts = null;

    for (const sep of separators) {
      if (title.includes(sep)) {
        parts = title.split(sep).map(p => p.trim());
        break;
      }
    }

    // Special handling for _ separator (common in Vietnamese YouTube titles)
    // e.g., "VẠN LÝ SẦU _ 1 bài cực hay của" → take only first part before _
    if (!parts && title.includes('_')) {
      const underscoreParts = title.split('_').map(p => p.trim());
      if (underscoreParts.length >= 2) {
        // First part is usually the song title
        parts = [underscoreParts[0]];
      }
    }

    if (parts && parts.length >= 2) {
      // In Vietnamese music titles, usually:
      // Format 1: "Song Name - Artist Name" (most common)
      // Format 2: "ARTIST NAME - Song Name" (when artist is ALL CAPS)

      const first = parts[0];
      const second = parts[1];

      // If second part has more uppercase and is shorter, it's likely the artist
      const secondUpperRatio = (second.match(/[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g) || []).length / second.length;
      const firstUpperRatio = (first.match(/[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g) || []).length / first.length;

      if (secondUpperRatio > 0.7 && second.length < 50) {
        // Format: "Song Title - ARTIST NAME"
        title = first;
        artist = second;
      } else if (firstUpperRatio > 0.7 && first.length < 50 && secondUpperRatio < 0.5) {
        // Format: "ARTIST NAME - Song Title"
        artist = first;
        title = second;
      } else {
        // Default: "Song - Artist" (Vietnamese common format)
        title = first;
        artist = second;
      }
    }

    // Clean up final title and artist
    title = title
      .replace(/\(\s*\)/g, '') // Remove empty parentheses
      .replace(/\[\s*\]/g, '') // Remove empty brackets
      .replace(/^\s*[-–|•]\s*/, '')
      .replace(/\s*[-–|•]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    artist = artist
      .replace(/\(\s*\)/g, '') // Remove empty parentheses
      .replace(/\[\s*\]/g, '') // Remove empty brackets
      .replace(/^\s*[-–|•]\s*/, '')
      .replace(/\s*[-–|•]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If artist is still uploader name and contains "Topic" or "VEVO", clean it
    if (artist.includes('- Topic') || artist.includes('VEVO')) {
      artist = artist.replace(/\s*-\s*Topic/gi, '').replace(/VEVO/gi, '').trim();
    }

    return { title, artist };

  } catch (error) {
    logger.error('[SongParser] Rule-based parsing error:', error);
    return {
      title: youtubeTitle,
      artist: uploaderName || 'Unknown Artist'
    };
  }
}

/**
 * Parse song title and artist from YouTube video title
 * Uses Gemini AI first, falls back to rules if AI fails
 */
async function parseSongMetadata(youtubeTitle, uploaderName) {
  try {
    // Try AI parsing first
    const aiResult = await parseWithAI(youtubeTitle);
    if (aiResult) {
      return aiResult;
    }

    // Fallback to rule-based parsing
    logger.info('[SongParser] Using rule-based fallback for:', youtubeTitle);
    const result = parseWithRules(youtubeTitle, uploaderName);
    logger.info(`[SongParser] Rule-based: "${youtubeTitle}" → Title: "${result.title}", Artist: "${result.artist}"`);

    return result;

  } catch (error) {
    logger.error('[SongParser] Error parsing:', error);
    return {
      title: youtubeTitle,
      artist: uploaderName || 'Unknown Artist'
    };
  }
}

module.exports = { parseSongMetadata };
