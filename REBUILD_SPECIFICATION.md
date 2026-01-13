# Music Player Application - Complete Technical Specification
## Rebuild with Node.js + Express + Socket.io

**Version:** 2.0
**Date:** January 2026
**Purpose:** Complete rewrite to address Flask architectural limitations

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Why Node.js?](#why-nodejs)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Database Schema](#database-schema)
6. [API Specification](#api-specification)
7. [WebSocket Events](#websocket-events)
8. [Scheduler Implementation](#scheduler-implementation)
9. [Frontend Architecture](#frontend-architecture)
10. [YouTube Integration](#youtube-integration)
11. [Authentication & Authorization](#authentication--authorization)
12. [Deployment](#deployment)
13. [Migration Strategy](#migration-strategy)
14. [Project Structure](#project-structure)
15. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### Problems with Current Flask Implementation

1. **Socket.IO Unreliable from Background Threads**
   - Events emitted from APScheduler don't reach clients
   - No proper Flask request context in background threads
   - Required hacky workarounds (pending_playback flag + polling)

2. **Blocking I/O Kills Performance**
   - YouTube metadata downloads block entire app (single-threaded WSGI)
   - One slow request freezes all users
   - Polling workarounds cause severe lag (290+ seconds per request)

3. **No Native Async Support**
   - Can't handle concurrent long-running operations
   - Threading adds complexity without solving core issues

4. **Architectural Mismatch**
   - Flask designed for request/response, not real-time
   - Real-time features require constant workarounds

### Solution: Node.js + Express + Socket.io

- **Event-driven architecture** - Perfect for scheduler + real-time updates
- **Non-blocking I/O** - YouTube downloads won't block other users
- **Native async/await** - Clean, readable concurrent code
- **Socket.io designed for this** - Reliable broadcasts from any context
- **Single language** - JavaScript on both frontend and backend

---

## Why Node.js?

### Core Advantages

1. **Event Loop Architecture**
   ```
   ┌───────────────────────────┐
   │   Single-Threaded Loop    │
   │  (Non-blocking I/O)       │
   └───────────────────────────┘
            ↓
   ┌───────────────────────────┐
   │  Thread Pool for I/O      │
   │  (File, Network, etc.)    │
   └───────────────────────────┘
   ```
   - YouTube downloads happen in background
   - Main thread keeps serving other requests
   - No blocking, no lag

2. **Socket.io Native Integration**
   ```javascript
   // From ANYWHERE in the app - scheduler, routes, etc.
   io.emit('queue_updated');  // Works perfectly!
   ```
   - No request context needed
   - Broadcasts work from timers, schedulers, anywhere
   - Reliable delivery

3. **Async/Await for Readability**
   ```javascript
   async function playScheduledSong(scheduleId) {
     const schedule = await Schedule.findById(scheduleId);
     const topSong = await Song.getTopVoted();
     const streamUrl = await getYouTubeStream(topSong.url);

     io.emit('play_song', { song: topSong, streamUrl, volume: schedule.volume });
     await topSong.markAsPlayed();
   }
   ```
   - No callback hell
   - Clean error handling with try/catch
   - Sequential logic easy to follow

4. **Performance**
   - Can handle 1000s of concurrent connections
   - Non-blocking I/O means YouTube download for User A doesn't affect User B
   - Low memory footprint

---

## Technology Stack

### Backend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20.x LTS | JavaScript runtime |
| Framework | Express | 4.x | HTTP server & routing |
| Real-time | Socket.io | 4.x | WebSocket communication |
| Database ORM | Sequelize | 6.x | SQL ORM (SQLite/PostgreSQL) |
| Scheduler | node-schedule | 2.x | Cron-like job scheduling |
| YouTube | ytdl-core | 4.x | YouTube stream URL extraction |
| Authentication | Passport.js | 0.7.x | Auth middleware |
| Session | express-session | 1.x | Session management |
| Validation | Joi | 17.x | Request validation |
| Environment | dotenv | 16.x | Config management |

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Template Engine | EJS or Handlebars | Server-side rendering |
| CSS Framework | Bootstrap 5 | UI components |
| Icons | Bootstrap Icons | Icons |
| WebSocket Client | Socket.io-client | Real-time updates |
| HTTP Client | Fetch API | AJAX requests |

### Database

**Development:** SQLite (easy setup, file-based)
**Production:** PostgreSQL (robust, concurrent access)
**Migration Tool:** Sequelize migrations

### Development Tools

- **Nodemon** - Auto-restart on file changes
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Admin Page │  │  Public Page │  │ Audio Player │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
│                    Socket.io Client                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
                  HTTPS + WebSocket
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                      NODE.JS SERVER                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 Express App                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │  Routes  │  │   Auth   │  │  Socket.io       │    │  │
│  │  │  /api/*  │  │ Passport │  │  Event Handlers  │    │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              node-schedule (Cron Jobs)                 │  │
│  │  - Monitors active schedules                           │  │
│  │  - Triggers playback at scheduled time                 │  │
│  │  - Broadcasts via Socket.io (works perfectly!)        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │               Sequelize ORM                            │  │
│  │  Models: User, Song, Vote, Schedule, PlaybackState    │  │
│  └────────────────┬───────────────────────────────────────┘  │
└───────────────────┼──────────────────────────────────────────┘
                    │
┌───────────────────┴──────────────────────────────────────────┐
│              Database (SQLite/PostgreSQL)                    │
│  Tables: users, songs, votes, schedules, playback_state     │
└──────────────────────────────────────────────────────────────┘

External API:
┌──────────────────────────────────────────────────────────────┐
│                    YouTube (ytdl-core)                       │
│  - Extract stream URLs (non-blocking)                        │
│  - Get metadata                                              │
└──────────────────────────────────────────────────────────────┘
```

### Request Flow Examples

#### 1. User Votes for a Song

```
Client                 Server                Database           Socket.io
  │                      │                      │                  │
  │──POST /api/vote──────>│                      │                  │
  │                      │                      │                  │
  │                      │──Check auth──────────>│                  │
  │                      │<─────user─────────────│                  │
  │                      │                      │                  │
  │                      │──Create/Update vote──>│                  │
  │                      │<─────success──────────│                  │
  │                      │                      │                  │
  │<─────200 OK──────────│                      │                  │
  │                      │                      │                  │
  │                      │──emit('queue_updated')──────────────────>│
  │                      │                      │                  │
  │<────────────────────────────'queue_updated' event──────────────│
  │                      │                      │                  │
  │──GET /api/queue──────>│                      │                  │
  │                      │──Query songs─────────>│                  │
  │                      │<─────songs────────────│                  │
  │<─────songs JSON──────│                      │                  │
```

#### 2. Scheduled Playback (The Magic!)

```
node-schedule         Server                Database           Socket.io        Client
     │                  │                      │                  │               │
     │──Time trigger────>│                      │                  │               │
     │                  │                      │                  │               │
     │                  │──Get top voted───────>│                  │               │
     │                  │<─────song─────────────│                  │               │
     │                  │                      │                  │               │
     │                  │──Get YouTube stream URL (async, non-blocking)            │
     │                  │                      │                  │               │
     │                  │──Mark song played────>│                  │               │
     │                  │                      │                  │               │
     │                  │──emit('play_song', {song, streamUrl, volume})─────────>│
     │                  │                      │                  │               │
     │                  │                      │                  │──'play_song'──>│
     │                  │                      │                  │               │
     │                  │                      │                  │               │<──Plays!
```

**Key Difference from Flask:**
- ✅ `emit()` works perfectly from scheduler (no request context needed!)
- ✅ No pending flags or polling hacks required
- ✅ Direct, reliable communication

---

## Database Schema

### ER Diagram

```
┌──────────────────┐
│      users       │
├──────────────────┤
│ id (PK)          │
│ username         │◄──────────┐
│ display_name     │           │
│ password_hash    │           │
│ is_admin         │           │
│ is_anonymous     │           │
│ session_id       │           │
│ created_at       │           │
│ last_seen        │           │
└────────┬─────────┘           │
         │                     │
         │                     │
         │ (user_id FK)        │
         │                     │
         ▼                     │
┌──────────────────┐           │
│      votes       │           │
├──────────────────┤           │
│ id (PK)          │           │
│ user_id (FK)─────┘           │
│ song_id (FK)─────┐           │
│ voted_at         │           │
└──────────────────┘           │
         │                     │
         │                     │
         ▼                     │
┌──────────────────┐           │
│      songs       │           │
├──────────────────┤           │
│ id (PK)          │           │
│ title            │           │
│ artist           │           │
│ youtube_url      │           │
│ duration         │           │
│ thumbnail_url    │           │
│ added_by (FK)────┘
│ played           │
│ played_at        │
│ added_at         │
└──────────────────┘

┌──────────────────┐
│    schedules     │
├──────────────────┤
│ id (PK)          │
│ name             │
│ cron_expression  │
│ volume           │
│ is_active        │
│ created_at       │
│ last_run         │
│ next_run         │
└──────────────────┘

┌──────────────────┐
│ playback_state   │
├──────────────────┤
│ id (PK)          │
│ current_song_id  │
│ is_playing       │
│ volume           │
│ position         │
│ updated_at       │
└──────────────────┘
```

### Sequelize Models

#### User Model

```javascript
// models/User.js
const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

class User extends Model {
  async validatePassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }

  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
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
    last_seen: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
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
```

#### Song Model

```javascript
// models/Song.js
const { Model, DataTypes } = require('sequelize');

class Song extends Model {
  // Get vote count for this song
  async getVoteCount() {
    return this.countVotes();
  }

  // Get top voted song from queue
  static async getTopVoted() {
    const { Vote } = require('./index');

    return this.findOne({
      where: { played: false },
      include: [{
        model: Vote,
        attributes: []
      }],
      attributes: {
        include: [
          [sequelize.fn('COUNT', sequelize.col('Votes.id')), 'vote_count']
        ]
      },
      group: ['Song.id'],
      order: [
        [sequelize.literal('vote_count'), 'DESC'],
        ['added_at', 'ASC']
      ]
    });
  }

  // Mark song as played
  async markAsPlayed() {
    this.played = true;
    this.played_at = new Date();
    await this.save();
  }

  // Restore song to queue
  async restoreToQueue() {
    // Delete all votes
    await this.setVotes([]);

    // Reset played status
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
```

#### Vote Model

```javascript
// models/Vote.js
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
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'song_id']
      }
    ]
  });

  return Vote;
};
```

#### Schedule Model

```javascript
// models/Schedule.js
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
```

#### PlaybackState Model

```javascript
// models/PlaybackState.js
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
```

#### Model Associations

```javascript
// models/index.js
const { Sequelize } = require('sequelize');
const config = require('../config/database');

const sequelize = new Sequelize(config);

// Import models
const User = require('./User')(sequelize);
const Song = require('./Song')(sequelize);
const Vote = require('./Vote')(sequelize);
const Schedule = require('./Schedule')(sequelize);
const PlaybackState = require('./PlaybackState')(sequelize);

// Define associations
User.hasMany(Song, { foreignKey: 'added_by', as: 'songs' });
Song.belongsTo(User, { foreignKey: 'added_by', as: 'addedBy' });

User.hasMany(Vote, { foreignKey: 'user_id', as: 'votes' });
Vote.belongsTo(User, { foreignKey: 'user_id' });

Song.hasMany(Vote, { foreignKey: 'song_id', as: 'votes' });
Vote.belongsTo(Song, { foreignKey: 'song_id' });

PlaybackState.belongsTo(Song, { foreignKey: 'current_song_id', as: 'currentSong' });

module.exports = {
  sequelize,
  User,
  Song,
  Vote,
  Schedule,
  PlaybackState
};
```

---

## API Specification

### REST Endpoints

#### Authentication

##### POST /api/auth/login
Login with username/password

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "display_name": "Administrator",
    "is_admin": true
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

##### POST /api/auth/logout
Logout current user

**Response (200):**
```json
{
  "success": true
}
```

##### GET /api/auth/me
Get current user info

**Response (200):**
```json
{
  "id": 1,
  "username": "admin",
  "display_name": "Administrator",
  "is_admin": true,
  "is_anonymous": false
}
```

#### Songs

##### GET /api/songs/queue
Get all unplayed songs with vote counts

**Response (200):**
```json
{
  "songs": [
    {
      "id": 5,
      "title": "Shape of You",
      "artist": "Ed Sheeran",
      "youtube_url": "https://youtube.com/watch?v=xxx",
      "duration": 234,
      "thumbnail_url": "https://i.ytimg.com/xxx.jpg",
      "vote_count": 12,
      "added_by": {
        "id": 2,
        "display_name": "John"
      },
      "added_at": "2026-01-10T10:30:00Z",
      "user_voted": true
    }
  ]
}
```

##### GET /api/songs/recently-played
Get recently played songs (last 10)

**Response (200):**
```json
{
  "songs": [
    {
      "id": 3,
      "title": "Bohemian Rhapsody",
      "artist": "Queen",
      "youtube_url": "https://youtube.com/watch?v=yyy",
      "played_at": "2026-01-10T09:00:00Z",
      "vote_count": 15
    }
  ]
}
```

##### POST /api/songs/add
Add a new song to queue

**Auth Required:** Yes

**Request:**
```json
{
  "youtube_url": "https://youtube.com/watch?v=xxx"
}
```

**Response (201):**
```json
{
  "success": true,
  "song": {
    "id": 10,
    "title": "Extracted Title",
    "artist": "Artist Name",
    "duration": 180,
    "thumbnail_url": "https://i.ytimg.com/xxx.jpg"
  }
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "Invalid YouTube URL"
}
```

##### DELETE /api/songs/:id
Delete a song from queue

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "message": "Song deleted"
}
```

##### POST /api/songs/:id/restore
Restore a played song back to queue (votes reset to 0)

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "message": "Song restored to queue"
}
```

#### Votes

##### POST /api/votes/:song_id
Vote for a song (or remove vote if already voted)

**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "voted": true,
  "vote_count": 13
}
```

**Response (when removing vote):**
```json
{
  "success": true,
  "voted": false,
  "vote_count": 12
}
```

#### Playback

##### GET /api/playback/status
Get current playback state

**Response (200):**
```json
{
  "current_song_id": 5,
  "is_playing": true,
  "position": 45,
  "volume": 70,
  "song": {
    "id": 5,
    "title": "Shape of You",
    "artist": "Ed Sheeran"
  }
}
```

##### POST /api/playback/play/:song_id
Play a specific song

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "stream_url": "https://...",
  "song": { /* song object */ }
}
```

##### POST /api/playback/next
Play next top-voted song

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "song": { /* song object */ },
  "stream_url": "https://..."
}
```

##### POST /api/playback/pause
Pause playback

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true
}
```

##### POST /api/playback/resume
Resume playback

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true
}
```

##### POST /api/playback/volume
Set volume

**Auth Required:** Admin only

**Request:**
```json
{
  "volume": 85
}
```

**Response (200):**
```json
{
  "success": true,
  "volume": 85
}
```

##### GET /api/playback/stream/:song_id
Get YouTube stream URL for a song

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "stream_url": "https://rr5---sn-xxxxxx.googlevideo.com/...",
  "expires_at": "2026-01-10T12:00:00Z"
}
```

#### Schedules

##### GET /api/schedules
Get all schedules

**Auth Required:** Admin only

**Response (200):**
```json
{
  "schedules": [
    {
      "id": 1,
      "name": "Weekday 5PM",
      "cron_expression": "0 17 * * 1-5",
      "volume": 70,
      "is_active": true,
      "last_run": "2026-01-09T17:00:00Z",
      "next_run": "2026-01-10T17:00:00Z",
      "created_at": "2026-01-05T10:00:00Z"
    }
  ]
}
```

##### POST /api/schedules
Create a new schedule

**Auth Required:** Admin only

**Request:**
```json
{
  "name": "Lunch Break",
  "cron_expression": "0 12 * * *",
  "volume": 60
}
```

**Response (201):**
```json
{
  "success": true,
  "schedule": {
    "id": 2,
    "name": "Lunch Break",
    "cron_expression": "0 12 * * *",
    "volume": 60,
    "is_active": true,
    "next_run": "2026-01-11T12:00:00Z"
  }
}
```

##### PUT /api/schedules/:id
Update a schedule

**Auth Required:** Admin only

**Request:**
```json
{
  "name": "Updated Name",
  "volume": 80,
  "is_active": false
}
```

**Response (200):**
```json
{
  "success": true,
  "schedule": { /* updated schedule */ }
}
```

##### DELETE /api/schedules/:id
Delete a schedule

**Auth Required:** Admin only

**Response (200):**
```json
{
  "success": true,
  "message": "Schedule deleted"
}
```

#### Admin

##### POST /api/admin/claim
Claim admin rights (if no admin exists or force claim enabled)

**Request:**
```json
{
  "password": "new_admin_password"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Admin claimed successfully"
}
```

---

## WebSocket Events

### Server → Client Events

#### `queue_updated`
Emitted when queue changes (new song, vote, delete)

**Payload:** None (client should refetch queue)

**Client Action:**
```javascript
socket.on('queue_updated', () => {
  loadQueue(); // Fetch /api/songs/queue
});
```

#### `play_song`
Emitted when a song should start playing

**Payload:**
```javascript
{
  song: {
    id: 5,
    title: "Shape of You",
    artist: "Ed Sheeran",
    thumbnail_url: "https://..."
  },
  stream_url: "https://googlevideo.com/...",
  volume: 70
}
```

**Client Action:**
```javascript
socket.on('play_song', ({ song, stream_url, volume }) => {
  audioPlayer.src = stream_url;
  audioPlayer.volume = volume / 100;
  audioPlayer.play();
  updateNowPlayingUI(song);
});
```

#### `playback_paused`
Emitted when playback is paused

**Payload:** None

**Client Action:**
```javascript
socket.on('playback_paused', () => {
  audioPlayer.pause();
});
```

#### `playback_resumed`
Emitted when playback is resumed

**Payload:** None

**Client Action:**
```javascript
socket.on('playback_resumed', () => {
  audioPlayer.play();
});
```

#### `volume_changed`
Emitted when volume is changed

**Payload:**
```javascript
{
  volume: 85
}
```

**Client Action:**
```javascript
socket.on('volume_changed', ({ volume }) => {
  audioPlayer.volume = volume / 100;
  updateVolumeUI(volume);
});
```

#### `recently_played_updated`
Emitted when a song is marked as played

**Payload:** None

**Client Action:**
```javascript
socket.on('recently_played_updated', () => {
  loadRecentlyPlayed(); // Fetch /api/songs/recently-played
});
```

#### `schedule_updated`
Emitted when schedules are created/updated/deleted

**Payload:** None (admin only)

**Client Action:**
```javascript
socket.on('schedule_updated', () => {
  loadSchedules(); // Fetch /api/schedules
});
```

### Client → Server Events

#### `join_admin_room`
Join admin-specific event room (for admin-only events)

**Emitted On:** Admin page load

**Payload:** None

**Server Action:**
```javascript
socket.on('join_admin_room', () => {
  if (req.user && req.user.is_admin) {
    socket.join('admin');
  }
});
```

---

## Scheduler Implementation

### node-schedule Integration

```javascript
// services/scheduler.js
const schedule = require('node-schedule');
const { Schedule, Song } = require('../models');
const { getYouTubeStreamUrl } = require('./youtube');
const logger = require('../utils/logger');

class SchedulerService {
  constructor(io) {
    this.io = io; // Socket.io instance
    this.jobs = new Map(); // scheduleId -> node-schedule job
  }

  // Initialize all active schedules on app start
  async initialize() {
    logger.info('[Scheduler] Initializing...');

    const activeSchedules = await Schedule.findAll({
      where: { is_active: true }
    });

    for (const sched of activeSchedules) {
      await this.addJob(sched);
    }

    logger.info(`[Scheduler] Initialized ${activeSchedules.length} active schedules`);
  }

  // Add a new scheduled job
  async addJob(scheduleRecord) {
    const { id, name, cron_expression, volume } = scheduleRecord;

    // Cancel existing job if any
    if (this.jobs.has(id)) {
      this.jobs.get(id).cancel();
    }

    // Create new job
    const job = schedule.scheduleJob(cron_expression, async () => {
      await this.executeSchedule(id, volume);
    });

    this.jobs.set(id, job);

    // Calculate and store next run time
    const nextRun = job.nextInvocation();
    scheduleRecord.next_run = nextRun;
    await scheduleRecord.save();

    logger.info(`[Scheduler] Added job: ${name} (${cron_expression}), next run: ${nextRun}`);
  }

  // Remove a scheduled job
  removeJob(scheduleId) {
    if (this.jobs.has(scheduleId)) {
      this.jobs.get(scheduleId).cancel();
      this.jobs.delete(scheduleId);
      logger.info(`[Scheduler] Removed job: ${scheduleId}`);
    }
  }

  // Execute scheduled playback
  async executeSchedule(scheduleId, volume) {
    logger.info(`[Scheduler] Executing schedule ${scheduleId}`);

    try {
      // Get FRESH top voted song (ensures last-second votes count!)
      const topSong = await Song.getTopVoted();

      if (!topSong) {
        logger.warn('[Scheduler] No songs in queue');
        return;
      }

      logger.info(`[Scheduler] Playing top voted song: ${topSong.title}`);

      // Get YouTube stream URL (async, non-blocking!)
      const streamUrl = await getYouTubeStreamUrl(topSong.youtube_url);

      // Mark song as played
      await topSong.markAsPlayed();

      // Update playback state
      const PlaybackState = require('../models').PlaybackState;
      const playbackState = await PlaybackState.getCurrent();
      playbackState.current_song_id = topSong.id;
      playbackState.is_playing = true;
      playbackState.volume = volume;
      playbackState.position = 0;
      await playbackState.save();

      // BROADCAST TO ALL CLIENTS (this works perfectly in Node.js!)
      this.io.emit('play_song', {
        song: topSong.toJSON(),
        stream_url: streamUrl,
        volume: volume
      });

      this.io.emit('queue_updated');
      this.io.emit('recently_played_updated');

      // Update last run time
      const scheduleRecord = await Schedule.findByPk(scheduleId);
      scheduleRecord.last_run = new Date();
      scheduleRecord.next_run = this.jobs.get(scheduleId).nextInvocation();
      await scheduleRecord.save();

      logger.info(`[Scheduler] Successfully played: ${topSong.title}`);

    } catch (error) {
      logger.error(`[Scheduler] Error executing schedule ${scheduleId}:`, error);
    }
  }

  // Reload all jobs (after schedule changes)
  async reload() {
    logger.info('[Scheduler] Reloading all jobs...');

    // Cancel all existing jobs
    for (const job of this.jobs.values()) {
      job.cancel();
    }
    this.jobs.clear();

    // Reinitialize
    await this.initialize();
  }
}

module.exports = SchedulerService;
```

### Usage in Main App

```javascript
// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const SchedulerService = require('./services/scheduler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize scheduler with Socket.io
const schedulerService = new SchedulerService(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Initialize scheduler on startup
  await schedulerService.initialize();
});

// Export for use in routes
app.set('scheduler', schedulerService);
app.set('io', io);
```

### Cron Expression Examples

```javascript
// Format: second minute hour day-of-month month day-of-week

// Every day at 5:00 PM
"0 17 * * *"

// Weekdays at 9:00 AM
"0 9 * * 1-5"

// Multiple times: 9AM, 12PM, 5PM daily
"0 9,12,17 * * *"

// Every hour on the hour
"0 * * * *"

// Every 30 minutes
"*/30 * * * *"

// First day of every month at midnight
"0 0 1 * *"
```

---

## Frontend Architecture

### Client-Side Structure

```
views/
├── layouts/
│   └── main.ejs              # Main layout with Socket.io client
├── partials/
│   ├── header.ejs
│   ├── footer.ejs
│   └── audio-player.ejs      # Audio player component
├── admin.ejs                 # Admin page
├── public.ejs                # Public voting page
└── login.ejs                 # Login page

public/
├── css/
│   └── styles.css
├── js/
│   ├── socket-client.js      # Socket.io event handlers
│   ├── admin.js              # Admin page logic
│   ├── public.js             # Public page logic
│   └── audio-player.js       # Audio player controls
└── images/
```

### Socket.io Client Setup

```html
<!-- views/layouts/main.ejs -->
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Music Player</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1/font/bootstrap-icons.css">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <%- include('../partials/header') %>

  <main>
    <%- body %>
  </main>

  <%- include('../partials/footer') %>

  <!-- Socket.io Client -->
  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/socket-client.js"></script>
  <script src="/js/audio-player.js"></script>

  <%- scripts %>
</body>
</html>
```

```javascript
// public/js/socket-client.js
const socket = io();

// Connection events
socket.on('connect', () => {
  console.log('[Socket] Connected');

  // Join admin room if admin page
  if (window.isAdmin) {
    socket.emit('join_admin_room');
  }
});

socket.on('disconnect', () => {
  console.log('[Socket] Disconnected');
});

// Queue updates
socket.on('queue_updated', () => {
  console.log('[Socket] Queue updated');
  if (typeof loadQueue === 'function') {
    loadQueue();
  }
});

// Playback events
socket.on('play_song', ({ song, stream_url, volume }) => {
  console.log('[Socket] Play song:', song.title);
  playSong(song, stream_url, volume);
});

socket.on('playback_paused', () => {
  console.log('[Socket] Playback paused');
  pausePlayback();
});

socket.on('playback_resumed', () => {
  console.log('[Socket] Playback resumed');
  resumePlayback();
});

socket.on('volume_changed', ({ volume }) => {
  console.log('[Socket] Volume changed:', volume);
  setVolume(volume);
});

// Recently played updates
socket.on('recently_played_updated', () => {
  console.log('[Socket] Recently played updated');
  if (typeof loadRecentlyPlayed === 'function') {
    loadRecentlyPlayed();
  }
});

// Schedule updates (admin only)
socket.on('schedule_updated', () => {
  console.log('[Socket] Schedules updated');
  if (typeof loadSchedules === 'function') {
    loadSchedules();
  }
});
```

### Audio Player Component

```javascript
// public/js/audio-player.js
class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.currentSong = null;

    // Setup event listeners
    this.audio.addEventListener('ended', () => this.onSongEnded());
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('error', (e) => this.onError(e));
  }

  playSong(song, streamUrl, volume) {
    this.currentSong = song;
    this.audio.src = streamUrl;
    this.audio.volume = volume / 100;

    this.audio.play()
      .then(() => {
        console.log('[Player] Playing:', song.title);
        this.updateUI(song);
      })
      .catch(error => {
        console.error('[Player] Play error:', error);
        this.showError('Không thể phát nhạc');
      });
  }

  pause() {
    this.audio.pause();
  }

  resume() {
    this.audio.play();
  }

  setVolume(volume) {
    this.audio.volume = volume / 100;
    this.updateVolumeUI(volume);
  }

  updateUI(song) {
    document.getElementById('now-playing-title').textContent = song.title;
    document.getElementById('now-playing-artist').textContent = song.artist || 'Unknown';
    document.getElementById('now-playing-thumbnail').src = song.thumbnail_url;
  }

  updateVolumeUI(volume) {
    document.getElementById('volume-slider').value = volume;
    document.getElementById('volume-value').textContent = volume;
  }

  onSongEnded() {
    console.log('[Player] Song ended');
    // Could auto-play next song here
  }

  onTimeUpdate() {
    const currentTime = Math.floor(this.audio.currentTime);
    const duration = Math.floor(this.audio.duration);

    // Update progress bar
    const progress = (currentTime / duration) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;

    // Update time display
    document.getElementById('current-time').textContent = formatTime(currentTime);
    document.getElementById('total-time').textContent = formatTime(duration);
  }

  onError(error) {
    console.error('[Player] Error:', error);
    this.showError('Lỗi phát nhạc');
  }

  showError(message) {
    // Show error notification
    const notification = document.getElementById('error-notification');
    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
}

// Initialize player
const audioPlayer = new AudioPlayer();

// Expose functions for socket client
function playSong(song, streamUrl, volume) {
  audioPlayer.playSong(song, streamUrl, volume);
}

function pausePlayback() {
  audioPlayer.pause();
}

function resumePlayback() {
  audioPlayer.resume();
}

function setVolume(volume) {
  audioPlayer.setVolume(volume);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### Admin Page Functions

```javascript
// public/js/admin.js
window.isAdmin = true;

// Load queue
async function loadQueue() {
  try {
    const response = await fetch('/api/songs/queue');
    const data = await response.json();

    const queueContainer = document.getElementById('queue-container');
    queueContainer.innerHTML = '';

    data.songs.forEach(song => {
      queueContainer.innerHTML += createSongCard(song);
    });
  } catch (error) {
    console.error('[Queue] Error loading:', error);
  }
}

// Load recently played
async function loadRecentlyPlayed() {
  try {
    const response = await fetch('/api/songs/recently-played');
    const data = await response.json();

    const container = document.getElementById('recently-played-container');
    container.innerHTML = '';

    data.songs.forEach(song => {
      container.innerHTML += createRecentlyPlayedCard(song);
    });
  } catch (error) {
    console.error('[Recently Played] Error loading:', error);
  }
}

// Load schedules
async function loadSchedules() {
  try {
    const response = await fetch('/api/schedules');
    const data = await response.json();

    const container = document.getElementById('schedules-container');
    container.innerHTML = '';

    data.schedules.forEach(schedule => {
      container.innerHTML += createScheduleCard(schedule);
    });
  } catch (error) {
    console.error('[Schedules] Error loading:', error);
  }
}

// Play next song
async function playNext() {
  try {
    const response = await fetch('/api/playback/next', {
      method: 'POST'
    });

    const data = await response.json();

    if (!data.success) {
      alert(data.message || 'No songs in queue');
    }
  } catch (error) {
    console.error('[Play Next] Error:', error);
    alert('Error playing next song');
  }
}

// Restore song to queue
async function restoreSong(songId) {
  if (!confirm('Restore this song to queue?')) return;

  try {
    const response = await fetch(`/api/songs/${songId}/restore`, {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      showNotification('Song restored to queue!', 'success');
    } else {
      showNotification(data.message, 'error');
    }
  } catch (error) {
    console.error('[Restore] Error:', error);
    showNotification('Error restoring song', 'error');
  }
}

// Initial load
loadQueue();
loadRecentlyPlayed();
loadSchedules();
```

---

## YouTube Integration

### ytdl-core Service

```javascript
// services/youtube.js
const ytdl = require('ytdl-core');
const logger = require('../utils/logger');

class YouTubeService {
  // Validate YouTube URL
  static isValidUrl(url) {
    return ytdl.validateURL(url);
  }

  // Get video info (title, artist, thumbnail, duration)
  static async getVideoInfo(url) {
    try {
      logger.info(`[YouTube] Fetching info for: ${url}`);

      const info = await ytdl.getInfo(url);
      const details = info.videoDetails;

      return {
        title: details.title,
        artist: details.author.name,
        duration: parseInt(details.lengthSeconds),
        thumbnail_url: details.thumbnails[details.thumbnails.length - 1].url
      };
    } catch (error) {
      logger.error('[YouTube] Error fetching info:', error);
      throw new Error('Failed to fetch YouTube video info');
    }
  }

  // Get stream URL (audio only, highest quality)
  static async getStreamUrl(url) {
    try {
      logger.info(`[YouTube] Getting stream URL for: ${url}`);

      const info = await ytdl.getInfo(url);

      // Get audio-only format with highest quality
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // Sort by bitrate (highest first)
      audioFormats.sort((a, b) => b.audioBitrate - a.audioBitrate);

      const bestFormat = audioFormats[0];

      logger.info(`[YouTube] Stream URL obtained (bitrate: ${bestFormat.audioBitrate}kbps)`);

      return {
        url: bestFormat.url,
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000) // URLs expire in ~6 hours
      };
    } catch (error) {
      logger.error('[YouTube] Error getting stream URL:', error);
      throw new Error('Failed to get YouTube stream URL');
    }
  }

  // Download audio stream (if you want to cache locally)
  static downloadAudio(url) {
    return ytdl(url, {
      quality: 'highestaudio',
      filter: 'audioonly'
    });
  }
}

module.exports = YouTubeService;
```

### Usage in Routes

```javascript
// routes/songs.js
const express = require('express');
const router = express.Router();
const { Song, User } = require('../models');
const YouTubeService = require('../services/youtube');
const { isAuthenticated } = require('../middleware/auth');

// Add song
router.post('/add', isAuthenticated, async (req, res) => {
  const { youtube_url } = req.body;

  try {
    // Validate URL
    if (!YouTubeService.isValidUrl(youtube_url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid YouTube URL'
      });
    }

    // Check if already in queue
    const existing = await Song.findOne({
      where: { youtube_url, played: false }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'This song is already in the queue'
      });
    }

    // Fetch video info (async, non-blocking!)
    const videoInfo = await YouTubeService.getVideoInfo(youtube_url);

    // Create song
    const song = await Song.create({
      ...videoInfo,
      youtube_url,
      added_by: req.user.id
    });

    // Broadcast update
    req.app.get('io').emit('queue_updated');

    res.status(201).json({
      success: true,
      song: song.toJSON()
    });

  } catch (error) {
    console.error('[Add Song] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add song'
    });
  }
});

module.exports = router;
```

---

## Authentication & Authorization

### Passport.js Setup

```javascript
// config/passport.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { User } = require('../models');

passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ where: { username } });

      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      const isValid = await user.validatePassword(password);

      if (!isValid) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

module.exports = passport;
```

### Auth Middleware

```javascript
// middleware/auth.js

// Ensure user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
}

// Ensure user is admin
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) {
    return next();
  }
  res.status(403).json({
    success: false,
    message: 'Admin access required'
  });
}

// Get or create anonymous user (for non-authenticated users)
async function getOrCreateAnonymousUser(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  const { User } = require('../models');
  const sessionId = req.sessionID;

  try {
    let user = await User.findOne({ where: { session_id: sessionId } });

    if (!user) {
      const anonymousName = `Guest_${Math.random().toString(36).substr(2, 6)}`;
      user = await User.create({
        username: `anon_${sessionId}`,
        display_name: anonymousName,
        password_hash: 'N/A',
        is_anonymous: true,
        session_id: sessionId
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Error creating anonymous user:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
}

module.exports = {
  isAuthenticated,
  isAdmin,
  getOrCreateAnonymousUser
};
```

### Auth Routes

```javascript
// routes/auth.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { User } = require('../models');

// Login
router.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      display_name: req.user.display_name,
      is_admin: req.user.is_admin
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      id: req.user.id,
      username: req.user.username,
      display_name: req.user.display_name,
      is_admin: req.user.is_admin,
      is_anonymous: req.user.is_anonymous
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

module.exports = router;
```

---

## Deployment

### Docker Setup

#### Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine

# Install ffmpeg (required by ytdl-core for some formats)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/musicplayer
      - SESSION_SECRET=${SESSION_SECRET}
      - PORT=3000
    volumes:
      - ./data:/app/data  # For SQLite or local storage
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=musicplayer
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

#### .env File

```bash
# .env
NODE_ENV=production
PORT=3000

# Database (PostgreSQL)
DATABASE_URL=postgres://user:pass@localhost:5432/musicplayer

# OR SQLite for development
# DATABASE_URL=sqlite:./data/music_player.db

# Session
SESSION_SECRET=your-super-secret-session-key-change-this

# Admin
DEFAULT_ADMIN_PASSWORD=change-this-on-first-run
```

### Environment Configuration

```javascript
// config/database.js
require('dotenv').config();

module.exports = {
  development: {
    dialect: 'sqlite',
    storage: './data/music_player.db',
    logging: console.log
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};
```

### Build & Run Commands

```bash
# Development
npm install
npm run dev  # Uses nodemon for auto-reload

# Production
npm install --only=production
npm start

# Docker
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

---

## Migration Strategy

### Export Data from Flask App

```python
# export_data.py (run on Flask app)
import json
import sqlite3
from datetime import datetime

def export_to_json():
    conn = sqlite3.connect('instance/music_player.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    data = {}

    # Export users
    cursor.execute('SELECT * FROM users')
    data['users'] = [dict(row) for row in cursor.fetchall()]

    # Export songs
    cursor.execute('SELECT * FROM songs')
    data['songs'] = [dict(row) for row in cursor.fetchall()]

    # Export votes
    cursor.execute('SELECT * FROM votes')
    data['votes'] = [dict(row) for row in cursor.fetchall()]

    # Export schedules
    cursor.execute('SELECT * FROM schedules')
    data['schedules'] = [dict(row) for row in cursor.fetchall()]

    conn.close()

    with open('exported_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    print(f"Exported {len(data['users'])} users, {len(data['songs'])} songs, {len(data['votes'])} votes")

if __name__ == '__main__':
    export_to_json()
```

### Import Data to Node.js App

```javascript
// scripts/import_data.js
const fs = require('fs');
const { User, Song, Vote, Schedule, sequelize } = require('../models');

async function importData() {
  const data = JSON.parse(fs.readFileSync('exported_data.json', 'utf-8'));

  try {
    await sequelize.sync({ force: true }); // CAREFUL: This drops tables!

    console.log('Importing users...');
    for (const user of data.users) {
      await User.create({
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        password_hash: user.password_hash,
        is_admin: user.is_admin,
        is_anonymous: user.is_anonymous,
        session_id: user.session_id,
        created_at: user.created_at,
        last_seen: user.last_seen
      });
    }

    console.log('Importing songs...');
    for (const song of data.songs) {
      await Song.create({
        id: song.id,
        title: song.title,
        artist: song.artist,
        youtube_url: song.youtube_url,
        duration: song.duration,
        thumbnail_url: song.thumbnail_url,
        added_by: song.added_by,
        played: song.played,
        played_at: song.played_at,
        added_at: song.added_at
      });
    }

    console.log('Importing votes...');
    for (const vote of data.votes) {
      await Vote.create({
        id: vote.id,
        user_id: vote.user_id,
        song_id: vote.song_id,
        voted_at: vote.voted_at
      });
    }

    console.log('Importing schedules...');
    for (const schedule of data.schedules) {
      await Schedule.create({
        id: schedule.id,
        name: schedule.name,
        cron_expression: schedule.cron_expression,
        volume: schedule.volume,
        is_active: schedule.is_active,
        created_at: schedule.created_at,
        last_run: schedule.last_run,
        next_run: schedule.next_run
      });
    }

    console.log('Import complete!');
  } catch (error) {
    console.error('Import error:', error);
  } finally {
    await sequelize.close();
  }
}

importData();
```

### Migration Steps

1. **Export data from Flask app**
   ```bash
   cd /path/to/flask-app
   python export_data.py
   # Creates exported_data.json
   ```

2. **Setup Node.js app**
   ```bash
   git clone <new-repo>
   cd music-player-nodejs
   npm install
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Import data**
   ```bash
   node scripts/import_data.js
   ```

4. **Test thoroughly**
   - Verify all users can login
   - Check song queue and votes
   - Test schedules
   - Test playback
   - Test real-time updates

5. **Deploy**
   ```bash
   docker-compose up -d
   ```

6. **Switch DNS/proxy**
   - Update nginx/proxy to point to new app
   - Monitor for issues

---

## Project Structure

```
music-player-nodejs/
├── config/
│   ├── database.js           # Database configuration
│   └── passport.js           # Passport authentication config
├── middleware/
│   └── auth.js               # Authentication middleware
├── models/
│   ├── index.js              # Model initialization & associations
│   ├── User.js
│   ├── Song.js
│   ├── Vote.js
│   ├── Schedule.js
│   └── PlaybackState.js
├── routes/
│   ├── auth.js               # /api/auth/*
│   ├── songs.js              # /api/songs/*
│   ├── votes.js              # /api/votes/*
│   ├── playback.js           # /api/playback/*
│   ├── schedules.js          # /api/schedules/*
│   └── admin.js              # /api/admin/*
├── services/
│   ├── scheduler.js          # node-schedule integration
│   └── youtube.js            # ytdl-core wrapper
├── utils/
│   └── logger.js             # Logging utility
├── views/
│   ├── layouts/
│   │   └── main.ejs
│   ├── partials/
│   │   ├── header.ejs
│   │   ├── footer.ejs
│   │   └── audio-player.ejs
│   ├── admin.ejs
│   ├── public.ejs
│   └── login.ejs
├── public/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── socket-client.js
│   │   ├── admin.js
│   │   ├── public.js
│   │   └── audio-player.js
│   └── images/
├── scripts/
│   ├── import_data.js        # Migration script
│   └── create_admin.js       # Create first admin
├── migrations/               # Sequelize migrations
├── data/                     # SQLite database (dev)
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── server.js                 # Main entry point
└── README.md
```

---

## Implementation Roadmap

### Phase 1: Core Setup (Week 1)

- [ ] Initialize Node.js project with Express
- [ ] Setup Sequelize with SQLite (development)
- [ ] Create database models
- [ ] Setup Sequelize migrations
- [ ] Implement basic authentication (Passport.js)
- [ ] Create login/logout routes
- [ ] Setup session management

### Phase 2: API Development (Week 2)

- [ ] Implement song routes (add, delete, queue, recently played)
- [ ] Implement vote routes (vote, unvote)
- [ ] Implement YouTube service (ytdl-core)
- [ ] Add song metadata extraction
- [ ] Create playback routes (play, pause, volume)
- [ ] Implement playback state management

### Phase 3: Real-time Features (Week 3)

- [ ] Setup Socket.io server
- [ ] Implement queue_updated event
- [ ] Implement play_song event
- [ ] Implement playback control events
- [ ] Create client-side Socket.io handlers
- [ ] Test real-time synchronization

### Phase 4: Scheduler (Week 4)

- [ ] Setup node-schedule
- [ ] Create Schedule model and routes
- [ ] Implement scheduler service
- [ ] Add cron expression validation
- [ ] Test scheduled playback
- [ ] Ensure Socket.io broadcasts work from scheduler

### Phase 5: Frontend (Week 5)

- [ ] Create EJS templates
- [ ] Build admin page UI
- [ ] Build public voting page UI
- [ ] Implement audio player component
- [ ] Add Bootstrap styling
- [ ] Test responsive design

### Phase 6: Advanced Features (Week 6)

- [ ] Implement restore song functionality
- [ ] Add admin claim feature
- [ ] Create schedule management UI
- [ ] Add error handling and notifications
- [ ] Implement rate limiting
- [ ] Add input validation (Joi)

### Phase 7: Testing & Optimization (Week 7)

- [ ] Write unit tests (Jest)
- [ ] Write integration tests
- [ ] Test concurrent users
- [ ] Optimize database queries
- [ ] Add database indexes
- [ ] Test YouTube URL edge cases

### Phase 8: Deployment (Week 8)

- [ ] Create Dockerfile
- [ ] Create docker-compose.yml
- [ ] Setup PostgreSQL for production
- [ ] Configure environment variables
- [ ] Setup logging
- [ ] Deploy to server
- [ ] Test in production environment

### Phase 9: Migration (Week 9)

- [ ] Export data from Flask app
- [ ] Import data to Node.js app
- [ ] Verify data integrity
- [ ] Run parallel testing (Flask vs Node.js)
- [ ] Switch traffic to new app
- [ ] Monitor for issues

### Phase 10: Polish & Documentation (Week 10)

- [ ] Write user documentation
- [ ] Write API documentation
- [ ] Create deployment guide
- [ ] Add monitoring/alerting
- [ ] Optimize performance
- [ ] Final testing

---

## Key Advantages Over Flask

### 1. **Reliable Real-time Communication**

**Flask (Current Problem):**
```python
# From scheduler - DOESN'T WORK
socketio.emit('play_song', data)  # Clients don't receive this!
```

**Node.js (Works Perfectly):**
```javascript
// From anywhere - scheduler, routes, timers - WORKS!
io.emit('play_song', data);  // All clients receive instantly
```

### 2. **Non-blocking I/O**

**Flask:**
- YouTube download blocks entire app
- One slow request = everyone waits
- Required polling hacks

**Node.js:**
```javascript
// Multiple YouTube downloads in parallel - no blocking!
const [song1Stream, song2Stream, song3Stream] = await Promise.all([
  getYouTubeStreamUrl(url1),
  getYouTubeStreamUrl(url2),
  getYouTubeStreamUrl(url3)
]);
// Other users completely unaffected
```

### 3. **Clean Async Code**

**Flask:**
```python
# Threading complexity, context issues
from threading import Thread
def background_task():
    with app.app_context():  # Need this!
        # Do work
Thread(target=background_task).start()
```

**Node.js:**
```javascript
// Natural async/await
async function backgroundTask() {
  const result = await doWork();
  return result;
}
```

### 4. **No Hacky Workarounds**

**Flask Required:**
- pending_playback flags
- Client polling every 2 seconds
- Internal API calls via HTTP
- Complex threading

**Node.js:**
- Direct Socket.io broadcasts
- Event-driven architecture
- No polling needed
- Clean, simple code

---

## Conclusion

This Node.js rebuild will solve all the fundamental architectural issues you experienced with Flask:

✅ **Scheduler broadcasts work reliably** - No more pending flags or polling
✅ **No web lag** - Non-blocking I/O handles YouTube downloads elegantly
✅ **Real-time updates** - Socket.io events work from anywhere in the app
✅ **Clean codebase** - Async/await instead of threading complexity
✅ **Scalable** - Can handle many concurrent users
✅ **Maintainable** - Standard patterns, fewer hacks

The migration path is clear, the technology is proven, and the architecture is sound. This is the right choice for your music player application.

Good luck with the rebuild! 🚀
