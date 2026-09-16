/**
 * Store the raw YouTube title and channel alongside the parsed metadata.
 *
 * Without these, a re-parse has nothing to work from: routes/songs.js fell back
 * to song.title, which is the already-parsed value, and the parser needs the
 * channel name to tell "Song - Artist" from "Artist - Song".
 */
const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../data/musicplayer.db'),
  logging: false,
});

const COLUMNS = {
  youtube_title: 'TEXT',
  youtube_channel: 'TEXT',
};

async function migrate() {
  const [existing] = await sequelize.query('PRAGMA table_info(songs)');
  const names = existing.map((col) => col.name);

  for (const [column, type] of Object.entries(COLUMNS)) {
    if (names.includes(column)) {
      console.log(`[Migration] Column "${column}" already exists, skipping`);
      continue;
    }
    await sequelize.query(`ALTER TABLE songs ADD COLUMN ${column} ${type};`);
    console.log(`[Migration] Added column "${column}"`);
  }

  console.log('[Migration] Done');
}

migrate()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error('[Migration] Failed:', error.message);
    await sequelize.close();
    process.exit(1);
  });
