const { Sequelize } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    // Add daily_song_adds column
    await queryInterface.addColumn('users', 'daily_song_adds', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

    // Add last_song_reset column
    await queryInterface.addColumn('users', 'last_song_reset', {
      type: Sequelize.DATE,
      allowNull: true
    });

    console.log('✅ Migration completed: Added daily_song_adds and last_song_reset columns');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'daily_song_adds');
    await queryInterface.removeColumn('users', 'last_song_reset');
    console.log('✅ Migration rolled back: Removed daily_song_adds and last_song_reset columns');
  }
};
