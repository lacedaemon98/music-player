const { Sequelize } = require('sequelize');
const config = require('../config/database');

const sequelize = new Sequelize(config);

// Import models
const User = require('./User')(sequelize);
const Song = require('./Song')(sequelize);
const Vote = require('./Vote')(sequelize);
const Schedule = require('./Schedule')(sequelize);
const PlaybackState = require('./PlaybackState')(sequelize);
const Message = require('./Message')(sequelize);

// Define associations
User.hasMany(Song, { foreignKey: 'added_by', as: 'songs' });
Song.belongsTo(User, { foreignKey: 'added_by', as: 'addedBy' });

User.hasMany(Vote, { foreignKey: 'user_id', as: 'votes' });
Vote.belongsTo(User, { foreignKey: 'user_id' });

Song.hasMany(Vote, { foreignKey: 'song_id', as: 'votes', onDelete: 'CASCADE' });
Vote.belongsTo(Song, { foreignKey: 'song_id' });

PlaybackState.belongsTo(Song, { foreignKey: 'current_song_id', as: 'currentSong' });

User.hasMany(Message, { foreignKey: 'user_id', as: 'messages' });
Message.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Song,
  Vote,
  Schedule,
  PlaybackState,
  Message
};
