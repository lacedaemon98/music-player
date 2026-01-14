const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

// Fallback templates if Claude API is down (expanded for more variety)
const FALLBACK_TEMPLATES = [
  'Tiếp theo chúng ta sẽ cùng đi đến bài {title} của {artist}. Đây là món quà âm nhạc đặc biệt với lời nhắn: {message}. Cùng thưởng thức nhé!',
  'Bây giờ là bài {title} do {artist} thể hiện. Một lời nhắn thật ý nghĩa: {message}. Hãy cùng cảm nhận!',
  'Chúng ta sẽ lắng nghe bài {title} của {artist}. Đây là món quà âm nhạc được gửi tặng kèm lời nhắn: {message}.',
  'Tiếp theo trong chương trình là bài {title} của {artist}. Với lời nhắn gửi: {message}. Mời các bạn thưởng thức!',
  'Kế tiếp là bài {title} của {artist}. Lời nhắn được gửi tặng: {message}. Hãy cùng đắm chìm trong giai điệu!',
  'Đến với bài hát tiếp theo, {title} - {artist}. Cùng với lời nhắn: {message}. Chúc mọi người lắng nghe vui vẻ!',
  'Bây giờ {artist} sẽ mang đến cho chúng ta bài {title}. Đi kèm với lời nhắn: {message}.',
  '{title} của {artist} đang chờ đón các bạn. Một lời nhắn đặc biệt: {message}. Cùng thưởng thức!',
  'Chúng ta tiếp tục với {title} do {artist} trình bày. Lời nhắn: {message}. Mời mọi người lắng nghe!',
  'Tiếp đến là {title} - một ca khúc của {artist}. Với lời nhắn ý nghĩa: {message}.',
  'Bài hát tiếp theo, {title} của {artist}. Được gửi tặng kèm lời nhắn: {message}. Hãy cùng cảm nhận!',
  'Đây là bài {title} do {artist} thể hiện. Lời nhắn gửi đến: {message}. Chúc các bạn nghe nhạc vui!',
  '{artist} với bài {title} sẽ đồng hành cùng các bạn. Lời nhắn: {message}. Cùng lắng nghe nhé!',
  'Tiếp theo, chúng ta có {title} của {artist}. Một món quà âm nhạc với lời nhắn: {message}.',
  'Bây giờ chúng ta cùng thưởng thức {title} - {artist}. Đi kèm lời nhắn: {message}. Mời các bạn!'
];

// Track last used template index to avoid immediate repeats
let lastTemplateIndex = -1;

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
- ĐA DẠNG HÓA cách mở đầu: "Tiếp theo...", "Bây giờ...", "Kế tiếp...", "Chúng ta sẽ cùng nghe...", v.v. KHÔNG lặp lại "Xin chào"
- Đọc tên bài hát và ca sĩ rõ ràng
- Nhắc đến lời nhắn gửi một cách tự nhiên, ấm áp
- KHÔNG dùng emoji hay ký tự đặc biệt
- Chỉ trả về lời giới thiệu, không thêm ghi chú hay giải thích

Ví dụ các cách mở đầu tự nhiên:
- "Tiếp theo chúng ta sẽ cùng đi đến bài [tên]..."
- "Bây giờ là bài [tên] của [ca sĩ]..."
- "Kế tiếp, chúng ta cùng lắng nghe..."
- "Chúng ta sẽ tiếp tục với bài..."
- "Đến với bài hát tiếp theo..."`;


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

  // Fallback to template (avoid repeating last used template)
  logger.info('[Claude] Using fallback template for:', title);

  let templateIndex;
  do {
    templateIndex = Math.floor(Math.random() * FALLBACK_TEMPLATES.length);
  } while (templateIndex === lastTemplateIndex && FALLBACK_TEMPLATES.length > 1);

  lastTemplateIndex = templateIndex;
  const template = FALLBACK_TEMPLATES[templateIndex];
  logger.info(`[Claude] Selected template ${templateIndex + 1}/${FALLBACK_TEMPLATES.length}`);

  const announcement = template
    .replace('{title}', title)
    .replace('{artist}', artist || 'Unknown Artist')
    .replace('{message}', dedication_message);

  return announcement;
}

module.exports = { generateDJAnnouncement };
