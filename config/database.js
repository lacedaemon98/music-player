require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
  development: {
    dialect: 'sqlite',
    storage: './data/musicplayer.db',
    logging: console.log,
    define: {
      timestamps: true,
      underscored: false
    }
  },
  production: {
    dialect: 'postgres',
    url: process.env.DATABASE_URL,
    logging: false,
    define: {
      timestamps: true,
      underscored: false
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};

module.exports = config[env];
