const express = require('express');
const router = express.Router();
const Contest = require('../models/Contest');
const Submission = require('../models/Submission');
const { protect } = require('../middleware/auth');
const { contestValidation, mongoIdParam } = require('../middleware/validate');

// @route   POST /api/contests
// @desc    Create a new contest
// @access  Private
router.post('/', protect, contestValidation, async (req, res) => {
  try {
    const { title, description, visibility, startTime, duration, problems, allowedEmails } = req.body;

    const contest = await Contest.create({
      title,
      description,
      visibility,
      startTime,
      duration,
      problems,
      allowedEmails: allowedEmails || [],
      creator: req.user._id,
    });

    res.status(201).json({ contest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests
// @desc    Get all public contests + user's private contests
// @access  Public (shows public), Private (shows user's)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const filter = req.query.status; // upcoming, live, ended

    let query = { visibility: 'public' };

    const contests = await Contest.find(query)
      .populate('creator', 'username')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Add virtual fields since lean() skips virtuals
    const now = new Date();
    const contestsWithStatus = contests.map((c) => {
      const endTime = new Date(c.startTime.getTime() + c.duration * 60 * 1000);
      let status;
      if (now < c.startTime) status = 'upcoming';
      else if (now >= c.startTime && now <= endTime) status = 'live';
      else status = 'ended';
      return { ...c, status, endTime };
    });

    // Filter by status if provided
    const filtered = filter
      ? contestsWithStatus.filter((c) => c.status === filter)
      : contestsWithStatus;

    const total = await Contest.countDocuments(query);

    res.json({
      contests: filtered,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests/my
// @desc    Get user's created and registered contests
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const created = await Contest.find({ creator: req.user._id })
      .sort({ startTime: -1 })
      .lean();

    const registered = await Contest.find({ registeredUsers: req.user._id })
      .populate('creator', 'username')
      .sort({ startTime: -1 })
      .lean();

    // Add status to all
    const now = new Date();
    const addStatus = (c) => {
      const endTime = new Date(c.startTime.getTime() + c.duration * 60 * 1000);
      let status;
      if (now < c.startTime) status = 'upcoming';
      else if (now >= c.startTime && now <= endTime) status = 'live';
      else status = 'ended';
      return { ...c, status, endTime };
    };

    res.json({
      created: created.map(addStatus),
      registered: registered.map(addStatus),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests/join/:shareCode
// @desc    Get contest by share code
// @access  Public
router.get('/join/:shareCode', async (req, res) => {
  try {
    const contest = await Contest.findOne({ shareCode: req.params.shareCode })
      .populate('creator', 'username');

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    res.json({ contest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests/:id
// @desc    Get single contest
// @access  Public
router.get('/:id', mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('creator', 'username')
      .populate('registeredUsers', 'username');

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    res.json({ contest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/contests/:id/register
// @desc    Register for a contest
// @access  Private
router.post('/:id/register', protect, mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Check if already registered
    if (contest.registeredUsers.includes(req.user._id)) {
      return res.status(400).json({ error: 'Already registered for this contest' });
    }

    // Check if private and user is allowed
    if (contest.visibility === 'private') {
      if (!contest.allowedEmails.includes(req.user.email) && 
          contest.creator.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'You are not allowed to join this private contest' });
      }
    }

    // Check if contest hasn't ended
    const endTime = new Date(contest.startTime.getTime() + contest.duration * 60 * 1000);
    if (new Date() > endTime) {
      return res.status(400).json({ error: 'Contest has already ended' });
    }

    contest.registeredUsers.push(req.user._id);
    await contest.save();

    res.json({ message: 'Successfully registered for the contest' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests/:id/problems
// @desc    Get contest problems (only during contest)
// @access  Private (registered users only)
router.get('/:id/problems', protect, mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Check registration
    if (!contest.registeredUsers.includes(req.user._id) &&
        contest.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not registered for this contest' });
    }

    // Check if contest has started
    if (new Date() < contest.startTime) {
      return res.status(403).json({ error: 'Contest has not started yet' });
    }

    res.json({ problems: contest.problems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/contests/:id/leaderboard
// @desc    Get live leaderboard
// @access  Public
router.get('/:id/leaderboard', mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Aggregate submissions to build leaderboard
    const leaderboard = await Submission.aggregate([
      { $match: { contest: contest._id, status: 'accepted' } },
      {
        $group: {
          _id: { user: '$user', problemIndex: '$problemIndex' },
          maxPoints: { $max: '$points' },
          lastSubmission: { $max: '$createdAt' },
        },
      },
      {
        $group: {
          _id: '$_id.user',
          totalScore: { $sum: '$maxPoints' },
          problemsSolved: { $sum: 1 },
          lastSubmission: { $max: '$lastSubmission' },
        },
      },
      { $sort: { totalScore: -1, lastSubmission: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          userId: '$_id',
          username: '$userInfo.username',
          totalScore: 1,
          problemsSolved: 1,
          lastSubmission: 1,
        },
      },
    ]);

    // Check if user is flagged
    const flaggedUserIds = contest.flaggedUsers.map((f) => f.user.toString());
    const leaderboardWithFlags = leaderboard.map((entry, i) => ({
      rank: i + 1,
      ...entry,
      isFlagged: flaggedUserIds.includes(entry.userId.toString()),
    }));

    res.json({ leaderboard: leaderboardWithFlags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
