require('dotenv').config();
const { sequelize, Message } = require('./models');

async function createMessagesTable() {
  try {
    console.log('[Migration] Creating messages table...');

    // Force sync only the Message model
    await Message.sync({ force: false });

    console.log('[Migration] Messages table created successfully!');

    // Check if table exists
    const [results] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'");
    console.log('[Migration] Table check:', results);

    process.exit(0);
  } catch (error) {
    console.error('[Migration] Error:', error);
    process.exit(1);
  }
}

createMessagesTable();
