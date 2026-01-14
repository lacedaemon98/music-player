const express = require('express');
const router = express.Router();
const { Song, Vote, sequelize } = require('../models');
const { ipUserMiddleware } = require('../middleware/ipUser');
const logger = require('../utils/logger');

// Add vote to song (allow multiple votes, no unvote)
router.post('/:song_id', ipUserMiddleware, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const songId = parseInt(req.params.song_id);
    const userId = req.user.id;

    // Reload user to get latest vote data with lock to prevent race conditions
    await req.user.reload({
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    // Check and reset votes if new day (within transaction)
    const today = new Date().toDateString();
    const lastReset = req.user.last_vote_reset ? new Date(req.user.last_vote_reset).toDateString() : null;

    if (lastReset !== today) {
      req.user.daily_votes = 0;
      req.user.last_vote_reset = new Date();
      await req.user.save({ transaction });
    }

    // Check if song exists and is not played
    const song = await Song.findByPk(songId, { transaction });

    if (!song) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài nào như thế bạn êi :\u0027('
      });
    }

    if (song.played) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Bài đã phát rồi vote làm gì bạn'
      });
    }

    // Check if user has votes remaining (don't increment yet)
    const maxVotes = req.user.is_admin ? 999 : 3;
    const canVote = (req.user.daily_votes || 0) < maxVotes;

    if (!canVote) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Hết lượt vote rồi bạn ơi. Mai quay lại nha',
        remaining_votes: 0
      });
    }

    // Add vote (allow multiple votes from same user)
    await Vote.create({
      user_id: userId,
      song_id: songId
    }, { transaction });

    // Only increment the counter AFTER successful vote creation (within transaction)
    req.user.daily_votes = (req.user.daily_votes || 0) + 1;
    await req.user.save({ transaction });

    // Get updated vote count
    const voteCount = await Vote.count({
      where: { song_id: songId },
      transaction
    });

    // Commit transaction before broadcasting
    await transaction.commit();

    logger.info(`[Votes] ${req.user.display_name} voted for song ${song.title} (total: ${voteCount})`);

    // Broadcast queue update
    const io = req.app.get('io');
    io.emit('queue_updated');

    // Calculate remaining votes
    const maxVotes = req.user.is_admin ? 999 : 3;
    const remaining = maxVotes - (req.user.daily_votes || 0);

    return res.json({
      success: true,
      voted: true,
      vote_count: voteCount,
      remaining_votes: remaining
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('[Votes] Error adding vote:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi vote rồi bạn ơi'
    });
  }
});

module.exports = router;
