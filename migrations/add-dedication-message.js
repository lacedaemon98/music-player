const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../data/musicplayer.db'),
  logging: console.log
});

async function migrate() {
  try {
    console.log('[Migration] Starting...');

    // Check if column already exists
    const [results] = await sequelize.query(`PRAGMA table_info(songs)`);
    const columnExists = results.some(col => col.name === 'dedication_message');

    if (columnExists) {
      console.log('[Migration] Column "dedication_message" already exists, skipping...');
      return;
    }

    // Add column
    await sequelize.query(`ALTER TABLE songs ADD COLUMN dedication_message TEXT;`);
    console.log('[Migration] ✅ Added column "dedication_message" to songs table');

    // Verify
    const [afterResults] = await sequelize.query(`PRAGMA table_info(songs)`);
    const newColumn = afterResults.find(col => col.name === 'dedication_message');
    if (newColumn) {
      console.log('[Migration] ✅ Verified: Column added successfully');
      console.log('[Migration] Column details:', newColumn);
    }

  } catch (error) {
    console.error('[Migration] ❌ Error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
