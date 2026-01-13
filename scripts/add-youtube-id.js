const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function addYoutubeIdColumn() {
  try {
    logger.info('[Migration] Adding youtube_id column to songs table...');

    // Check existing columns
    const [results] = await sequelize.query(`PRAGMA table_info(songs);`);
    const existingColumns = results.map(col => col.name);

    // Add youtube_id if not exists
    if (!existingColumns.includes('youtube_id')) {
      await sequelize.query(`ALTER TABLE songs ADD COLUMN youtube_id TEXT;`);
      logger.info('[Migration] youtube_id column added');

      // Extract youtube_id from existing youtube_urls
      const [songs] = await sequelize.query(`SELECT id, youtube_url FROM songs;`);

      for (const song of songs) {
        try {
          // Extract video ID from URL
          let videoId = null;
          const url = song.youtube_url;

          // Match different YouTube URL formats
          const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
            /youtube\.com\/embed\/([^&\s]+)/,
            /youtube\.com\/v\/([^&\s]+)/
          ];

          for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
              videoId = match[1];
              break;
            }
          }

          if (videoId) {
            await sequelize.query(`UPDATE songs SET youtube_id = ? WHERE id = ?;`, {
              replacements: [videoId, song.id]
            });
            logger.info(`[Migration] Updated song ${song.id} with youtube_id: ${videoId}`);
          }
        } catch (err) {
          logger.error(`[Migration] Error extracting youtube_id for song ${song.id}:`, err.message);
        }
      }

      logger.info('[Migration] youtube_id migration completed');
    } else {
      logger.info('[Migration] youtube_id column already exists');
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('[Migration] Error:', error);
    process.exit(1);
  }
}

addYoutubeIdColumn();
