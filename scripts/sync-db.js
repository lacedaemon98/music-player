const { sequelize, User } = require('../models');
const logger = require('../utils/logger');

async function syncDatabase() {
  try {
    logger.info('[DB] Starting database synchronization...');

    // Sync all models
    await sequelize.sync({ force: false });

    logger.info('[DB] Database synchronized successfully');

    // Check if admin exists
    const adminCount = await User.count({ where: { is_admin: true } });

    if (adminCount === 0) {
      logger.info('[DB] No admin user found. You can claim admin rights via /api/admin/claim endpoint');
    } else {
      logger.info(`[DB] Found ${adminCount} admin user(s)`);
    }

    logger.info('[DB] Database setup complete!');
    process.exit(0);
  } catch (error) {
    logger.error('[DB] Error synchronizing database:', error);
    process.exit(1);
  }
}

syncDatabase();
