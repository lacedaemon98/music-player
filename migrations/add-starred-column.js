const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    // Add starred column to songs table
    await queryInterface.addColumn('songs', 'starred', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  down: async (queryInterface) => {
    // Remove starred column
    await queryInterface.removeColumn('songs', 'starred');
  }
};
