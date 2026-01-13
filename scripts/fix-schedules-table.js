require('dotenv').config();
const { sequelize } = require('../models');

async function fixSchedulesTable() {
  try {
    console.log('Checking schedules table...');

    // Check if song_count column exists
    const [results] = await sequelize.query(`
      PRAGMA table_info(schedules);
    `);

    const hasSongCount = results.some(col => col.name === 'song_count');

    if (!hasSongCount) {
      console.log('Adding song_count column to schedules table...');
      await sequelize.query(`
        ALTER TABLE schedules ADD COLUMN song_count INTEGER DEFAULT 1;
      `);
      console.log('✅ song_count column added successfully');
    } else {
      console.log('✅ song_count column already exists');
    }

    await sequelize.close();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing schedules table:', error);
    process.exit(1);
  }
}

fixSchedulesTable();
