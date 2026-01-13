const { Model, DataTypes } = require('sequelize');

class Vote extends Model {}

module.exports = (sequelize) => {
  Vote.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    song_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'songs',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Vote',
    tableName: 'votes',
    timestamps: true,
    createdAt: 'voted_at',
    updatedAt: false
    // No unique index - allow multiple votes from same user for same song
  });

  return Vote;
};
