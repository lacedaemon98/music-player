const express = require('express');
const router = express.Router();
const { Song, Vote } = require('../models');
const { ipUserMiddleware } = require('../middleware/ipUser');
const logger = require('../utils/logger');

// Add vote to song (allow multiple votes, no unvote)
router.post('/:song_id', ipUserMiddleware, async (req, res) => {
  try {
    const songId = parseInt(req.params.song_id);
    const userId = req.user.id;

    // Reload user to get latest vote data
    await req.user.reload();

    // Check and reset votes if new day
    await req.user.checkAndResetVotes();

    // Check if song exists and is not played
    const song = await Song.findByPk(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bài nào như thế bạn êi :\u0027('
      });
    }

    if (song.played) {
      return res.status(400).json({
        success: false,
        message: 'Bài đã phát rồi vote làm gì bạn'
      });
    }

    // Check if user has votes remaining (don't increment yet)
    const canVote = await req.user.canVote();

    if (!canVote) {
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
    });

    // Only increment the counter AFTER successful vote creation
    await req.user.incrementVote();

    // Get updated vote count
    const voteCount = await Vote.count({ where: { song_id: songId } });

    logger.info(`[Votes] ${req.user.display_name} voted for song ${song.title} (total: ${voteCount})`);

    // Broadcast queue update
    const io = req.app.get('io');
    io.emit('queue_updated');

    return res.json({
      success: true,
      voted: true,
      vote_count: voteCount,
      remaining_votes: req.user.getRemainingVotes()
    });
  } catch (error) {
    logger.error('[Votes] Error adding vote:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi vote rồi bạn ơi'
    });
  }
});

module.exports = router;
