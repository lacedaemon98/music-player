const { sequelize } = require('./models');
const logger = require('./utils/logger');

async function migrate() {
  try {
    logger.info('[Migration] Starting database migration...');

    // Check if columns exist
    const [results] = await sequelize.query(`PRAGMA table_info(users);`);
    const columns = results.map(col => col.name);

    logger.info('[Migration] Existing columns:', columns);

    // Add daily_song_adds if not exists
    if (!columns.includes('daily_song_adds')) {
      logger.info('[Migration] Adding daily_song_adds column...');
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN daily_song_adds INTEGER DEFAULT 0;
      `);
      logger.info('[Migration] ✅ Added daily_song_adds column');
    } else {
      logger.info('[Migration] Column daily_song_adds already exists');
    }

    // Add last_song_reset if not exists
    if (!columns.includes('last_song_reset')) {
      logger.info('[Migration] Adding last_song_reset column...');
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN last_song_reset DATETIME;
      `);
      logger.info('[Migration] ✅ Added last_song_reset column');
    } else {
      logger.info('[Migration] Column last_song_reset already exists');
    }

    logger.info('[Migration] ✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
