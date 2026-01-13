const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

// Fallback templates if Claude API is down
const FALLBACK_TEMPLATES = [
  'Xin chào mọi người! Tiếp theo là bài {title} của {artist}. Đây là một món quà âm nhạc đặc biệt với lời nhắn: {message}. Cùng thưởng thức nhé!',
  'Chào các bạn! Chúng ta sẽ cùng lắng nghe bài {title} do {artist} thể hiện. Một lời nhắn thật ý nghĩa: {message}. Hãy cùng cảm nhận!',
  'Xin giới thiệu với các bạn bài hát {title} của {artist}. Đây là món quà âm nhạc được gửi tặng kèm theo lời nhắn: {message}. Chúc mọi người nghe nhạc vui vẻ!',
  'Tiếp theo trong chương trình là bài {title} - {artist}. Với một lời nhắn gửi đầy cảm xúc: {message}. Mời các bạn thưởng thức!',
  'Chào mừng các bạn quay lại! Chúng ta sẽ lắng nghe bài {title} của {artist}. Một lời nhắn được gửi tặng: {message}. Hãy cùng đắm chìm trong giai điệu!'
];

let client;

// Initialize Claude client
try {
  if (process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    logger.info('[Claude] Client initialized successfully');
  } else {
    logger.warn('[Claude] No API key found, will use fallback templates');
  }
} catch (error) {
  logger.error('[Claude] Failed to initialize client:', error);
  logger.warn('[Claude] Will use fallback templates');
}

/**
 * Generate Vietnamese radio DJ announcement for a song
 * Falls back to templates if API is unavailable
 */
async function generateDJAnnouncement(song) {
  const { title, artist, dedication_message } = song;

  // Try Claude API first
  if (client) {
    try {
      const prompt = `Bạn là một DJ radio Việt Nam chuyên nghiệp và nhiệt tình.

Hãy tạo một lời giới thiệu ngắn gọn (2-3 câu, khoảng 30-40 từ) cho bài hát tiếp theo với thông tin sau:
- Tên bài hát: "${title}"
- Ca sĩ: "${artist || 'Unknown'}"
- Lời nhắn gửi: "${dedication_message}"

Yêu cầu:
- Giọng điệu thân thiện, vui vẻ, tự nhiên như đang nói chuyện trực tiếp
- Đọc tên bài hát và ca sĩ rõ ràng
- Nhắc đến lời nhắn gửi một cách tự nhiên, ấm áp
- KHÔNG dùng emoji hay ký tự đặc biệt
- Chỉ trả về lời giới thiệu, không thêm ghi chú hay giải thích

Ví dụ format: "Xin chào mọi người! Tiếp theo là bài [tên bài] của [ca sĩ]. Đây là món quà âm nhạc đặc biệt với lời nhắn: [nội dung]. Cùng thưởng thức nhé!"`;

      logger.info('[Claude] Generating DJ announcement for:', title);

      const message = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const announcement = message.content[0].text.trim();
      logger.info('[Claude] Generated announcement successfully');

      return announcement;
    } catch (error) {
      logger.error('[Claude] API error:', error.message);
      logger.warn('[Claude] Falling back to template');
    }
  }

  // Fallback to template
  logger.info('[Claude] Using fallback template for:', title);
  const template = FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];

  const announcement = template
    .replace('{title}', title)
    .replace('{artist}', artist || 'Unknown Artist')
    .replace('{message}', dedication_message);

  return announcement;
}

module.exports = { generateDJAnnouncement };
