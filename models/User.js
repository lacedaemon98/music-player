const { Model, DataTypes} = require('sequelize');
const bcrypt = require('bcrypt');

class User extends Model {
  async validatePassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }

  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  // Get remaining votes for today
  getRemainingVotes() {
    const maxVotes = this.is_admin ? 999 : 3;
    return maxVotes - (this.daily_votes || 0);
  }

  // Check and reset votes if new day
  async checkAndResetVotes() {
    const today = new Date().toDateString();
    const lastReset = this.last_vote_reset ? new Date(this.last_vote_reset).toDateString() : null;

    if (lastReset !== today) {
      this.daily_votes = 0;
      this.last_vote_reset = new Date();
      await this.save();
    }
  }

  // Check if user can vote (without incrementing)
  async canVote() {
    await this.checkAndResetVotes();
    const remaining = this.getRemainingVotes();
    return remaining > 0;
  }

  // Use a vote (check + increment)
  async useVote() {
    await this.checkAndResetVotes();

    const remaining = this.getRemainingVotes();
    if (remaining <= 0) {
      return false;
    }

    this.daily_votes = (this.daily_votes || 0) + 1;
    await this.save();
    return true;
  }

  // Increment vote counter (call AFTER successful vote)
  async incrementVote() {
    this.daily_votes = (this.daily_votes || 0) + 1;
    await this.save();
  }

  // Return a vote
  async returnVote() {
    if (this.daily_votes > 0) {
      this.daily_votes -= 1;
      await this.save();
    }
  }

  // Get remaining song adds for today
  getRemainingAdds() {
    const maxAdds = this.is_admin ? 20 : 1;
    return maxAdds - (this.daily_song_adds || 0);
  }

  // Check and reset song adds if new day
  async checkAndResetAdds() {
    const today = new Date().toDateString();
    const lastReset = this.last_song_reset ? new Date(this.last_song_reset).toDateString() : null;

    if (lastReset !== today) {
      this.daily_song_adds = 0;
      this.last_song_reset = new Date();
      await this.save();
    }
  }

  // Check if user can add song (without incrementing)
  async canAddSong() {
    await this.checkAndResetAdds();
    const remaining = this.getRemainingAdds();
    return remaining > 0;
  }

  // Use a song add (check + increment)
  async useSongAdd() {
    await this.checkAndResetAdds();

    const remaining = this.getRemainingAdds();
    if (remaining <= 0) {
      return false;
    }

    this.daily_song_adds = (this.daily_song_adds || 0) + 1;
    await this.save();
    return true;
  }

  // Increment song add counter (call AFTER successful song creation)
  async incrementSongAdd() {
    this.daily_song_adds = (this.daily_song_adds || 0) + 1;
    await this.save();
  }
}

module.exports = (sequelize) => {
  User.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false
    },
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    is_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_anonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    session_id: {
      type: DataTypes.STRING(255),
      unique: true,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),  // IPv6 max length
      allowNull: true,
      index: true
    },
    last_seen: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    daily_votes: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    last_vote_reset: {
      type: DataTypes.DATE,
      allowNull: true
    },
    daily_song_adds: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    last_song_reset: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return User;
};
