const { Model, DataTypes } = require('sequelize');

class PlaybackState extends Model {
  // Get or create singleton playback state
  static async getCurrent() {
    let state = await this.findOne();
    if (!state) {
      state = await this.create({});
    }
    return state;
  }
}

module.exports = (sequelize) => {
  PlaybackState.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    current_song_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'songs',
        key: 'id'
      }
    },
    is_playing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    volume: {
      type: DataTypes.INTEGER,
      defaultValue: 70,
      validate: {
        min: 0,
        max: 100
      }
    },
    position: {
      type: DataTypes.INTEGER, // seconds
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'PlaybackState',
    tableName: 'playback_state',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at'
  });

  return PlaybackState;
};
