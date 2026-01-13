const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function fixVotesTable() {
  try {
    logger.info('[Migration] Fixing votes table to allow multiple votes...');

    // Drop the existing votes table
    await sequelize.query('DROP TABLE IF EXISTS votes;');
    logger.info('[Migration] Dropped old votes table');

    // Recreate the votes table without unique constraint
    await sequelize.query(`
      CREATE TABLE votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (song_id) REFERENCES songs(id)
      );
    `);
    logger.info('[Migration] Created new votes table without unique constraint');

    // Create non-unique indexes for performance
    await sequelize.query('CREATE INDEX idx_votes_user_id ON votes(user_id);');
    await sequelize.query('CREATE INDEX idx_votes_song_id ON votes(song_id);');
    logger.info('[Migration] Created indexes');

    logger.info('[Migration] Votes table fixed successfully - multiple votes now allowed');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('[Migration] Error:', error);
    process.exit(1);
  }
}

fixVotesTable();
