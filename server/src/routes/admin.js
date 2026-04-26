const express = require('express');
const router = express.Router();
const Contest = require('../models/Contest');
const ActivityLog = require('../models/ActivityLog');
const Submission = require('../models/Submission');
const { protect } = require('../middleware/auth');
const { mongoIdParam } = require('../middleware/validate');

router.use(protect);

// GET /api/admin/contests/:id/activity
router.get('/contests/:id/activity', mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    if (contest.creator.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const activities = await ActivityLog.find({ contest: req.params.id })
      .populate('user', 'username email').sort({ timestamp: -1 }).limit(limit);
    res.json({ activities });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/contests/:id/participants
router.get('/contests/:id/participants', mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('registeredUsers', 'username email')
      .populate('flaggedUsers.user', 'username email');
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    if (contest.creator.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const flaggedIds = contest.flaggedUsers.map(f => f.user._id.toString());
    const stats = await Submission.aggregate([
      { $match: { contest: contest._id } },
      { $group: { _id: '$user', total: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } }, score: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, '$points', 0] } } } }
    ]);
    const sMap = {}; stats.forEach(s => { sMap[s._id.toString()] = s; });
    const participants = contest.registeredUsers.map(u => {
      const s = sMap[u._id.toString()] || { total: 0, accepted: 0, score: 0 };
      return { user: u, isFlagged: flaggedIds.includes(u._id.toString()), submissions: s.total, accepted: s.accepted, score: s.score };
    });
    res.json({ participants });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/contests/:id/flags
router.get('/contests/:id/flags', mongoIdParam, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).populate('flaggedUsers.user', 'username email');
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    if (contest.creator.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    res.json({ flaggedUsers: contest.flaggedUsers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
