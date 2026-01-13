require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { sequelize } = require('./models');
const logger = require('./utils/logger');
const schedulerService = require('./services/scheduler');
const offlineMusicService = require('./services/offlineMusic');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Port configuration
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
const sessionStore = new SequelizeStore({
  db: sequelize
});

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
});

app.use(sessionMiddleware);

// Sync session store
sessionStore.sync();

// Passport.js initialization
const passport = require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Share session with Socket.io
io.engine.use(sessionMiddleware);
io.engine.use(passport.session());

// Initialize Socket.io
const setupSocket = require('./socket');
setupSocket(io);

// Make io available to routes
app.set('io', io);

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const songRoutes = require('./routes/songs');
const voteRoutes = require('./routes/votes');
const playbackRoutes = require('./routes/playback');
const scheduleRoutes = require('./routes/schedules');
const chatRoutes = require('./routes/chat');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/chat', chatRoutes);

// View routes
app.get('/', (req, res) => {
  logger.info(`[Server] GET / - User: ${req.user ? req.user.username : 'guest'}, Is Admin: ${req.user ? req.user.is_admin : false}`);

  // If admin logged in, redirect to admin panel
  if (req.user && req.user.is_admin) {
    logger.info('[Server] Redirecting admin to /admin');
    return res.redirect('/admin');
  }

  res.render('public', {
    user: req.user || null
  });
});

app.get('/admin', (req, res) => {
  if (!req.user || !req.user.is_admin) {
    return res.redirect('/login');
  }
  res.render('admin', {
    user: req.user
  });
});

app.get('/login', (req, res) => {
  if (req.user && req.user.is_admin) {
    return res.redirect('/admin');
  }
  res.render('login');
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('[Server] Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('[Database] Connection established successfully');

    // Sync database models
    await sequelize.sync();
    logger.info('[Database] Models synchronized');

    // Initialize offline music service
    await offlineMusicService.initialize();
    logger.info('[OfflineMusic] Initialized successfully');

    // Initialize scheduler with Socket.io
    schedulerService.setSocketIO(io);
    await schedulerService.initialize();
    logger.info('[Scheduler] Initialized successfully');

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`[Server] Running on port ${PORT}`);
      logger.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`[Server] Access at: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('[Server] SIGTERM received, shutting down gracefully');
  await sequelize.close();
  server.close(() => {
    logger.info('[Server] Process terminated');
  });
});

process.on('SIGINT', async () => {
  logger.info('[Server] SIGINT received, shutting down gracefully');
  await sequelize.close();
  server.close(() => {
    logger.info('[Server] Process terminated');
    process.exit(0);
  });
});

startServer();

// Export for use in other modules
module.exports = { app, server };
