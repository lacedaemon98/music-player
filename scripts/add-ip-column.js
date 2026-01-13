const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function addIpColumn() {
  try {
    logger.info('[Migration] Adding missing columns to users table...');

    // Check existing columns
    const [results] = await sequelize.query(`PRAGMA table_info(users);`);
    const existingColumns = results.map(col => col.name);

    // Add ip_address if not exists
    if (!existingColumns.includes('ip_address')) {
      await sequelize.query(`ALTER TABLE users ADD COLUMN ip_address TEXT;`);
      logger.info('[Migration] ip_address column added');
    } else {
      logger.info('[Migration] ip_address column already exists');
    }

    // Add daily_votes if not exists
    if (!existingColumns.includes('daily_votes')) {
      await sequelize.query(`ALTER TABLE users ADD COLUMN daily_votes INTEGER DEFAULT 0;`);
      logger.info('[Migration] daily_votes column added');
    } else {
      logger.info('[Migration] daily_votes column already exists');
    }

    // Add last_vote_reset if not exists
    if (!existingColumns.includes('last_vote_reset')) {
      await sequelize.query(`ALTER TABLE users ADD COLUMN last_vote_reset TEXT;`);
      logger.info('[Migration] last_vote_reset column added');
    } else {
      logger.info('[Migration] last_vote_reset column already exists');
    }

    logger.info('[Migration] All columns added successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('[Migration] Error:', error);
    process.exit(1);
  }
}

addIpColumn();
