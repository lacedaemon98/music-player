const { Model, DataTypes } = require('sequelize');

class Song extends Model {
  // Get vote count for this song
  async getVoteCount() {
    return this.countVotes();
  }

  // Get top voted song from queue
  static async getTopVoted() {
    // Use raw SQL to avoid complex Sequelize query issues
    // Starred songs have highest priority, then by vote count, then by added_at
    const [results] = await this.sequelize.query(`
      SELECT
        s.*,
        COUNT(v.id) as vote_count
      FROM songs s
      LEFT JOIN votes v ON s.id = v.song_id
      WHERE s.played = 0
      GROUP BY s.id
      ORDER BY s.starred DESC, vote_count DESC, s.added_at ASC
      LIMIT 1
    `);

    if (results.length === 0) {
      return null;
    }

    // Return as Song instance
    return this.build(results[0], { isNewRecord: false });
  }

  // Mark song as played
  async markAsPlayed() {
    this.played = true;
    this.played_at = new Date();
    await this.save();
  }

  // Restore song to queue (keep votes and dedication message)
  async restoreToQueue() {
    // Reset played status only (keep votes and dedication message)
    this.played = false;
    this.played_at = null;
    await this.save();
  }
}

module.exports = (sequelize) => {
  Song.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    artist: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    youtube_url: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    youtube_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true  // Prevent duplicate video IDs
    },
    duration: {
      type: DataTypes.INTEGER, // seconds
      allowNull: true
    },
    thumbnail_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    added_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    played: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    played_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    dedication_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    starred: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Song',
    tableName: 'songs',
    timestamps: true,
    createdAt: 'added_at',
    updatedAt: false
  });

  return Song;
};
