const { Model, DataTypes } = require('sequelize');

class Schedule extends Model {
  // Calculate next run time based on cron expression
  calculateNextRun() {
    const parser = require('cron-parser');
    const interval = parser.parseExpression(this.cron_expression);
    return interval.next().toDate();
  }
}

module.exports = (sequelize) => {
  Schedule.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    cron_expression: {
      type: DataTypes.STRING(100),
      allowNull: false,
      // Examples:
      // "0 17 * * 1-5" = 5:00 PM Monday-Friday
      // "0 9,12,17 * * *" = 9AM, 12PM, 5PM daily
    },
    volume: {
      type: DataTypes.INTEGER,
      defaultValue: 70,
      validate: {
        min: 0,
        max: 100
      }
    },
    song_count: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      validate: {
        min: 1,
        max: 10
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_run: {
      type: DataTypes.DATE,
      allowNull: true
    },
    next_run: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Schedule',
    tableName: 'schedules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return Schedule;
};
