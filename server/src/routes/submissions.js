const express = require('express');
const router = express.Router();
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const ActivityLog = require('../models/ActivityLog');
const { protect } = require('../middleware/auth');
const { submissionValidation } = require('../middleware/validate');

// @route   POST /api/submissions
// @desc    Submit code for a problem (10s delay then accepted)
// @access  Private
router.post('/', protect, submissionValidation, async (req, res) => {
  try {
    const { contestId, problemIndex, code, language } = req.body;

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Check registration
    if (!contest.registeredUsers.includes(req.user._id) &&
        contest.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not registered for this contest' });
    }

    // Check if contest is live
    const now = new Date();
    const endTime = new Date(contest.startTime.getTime() + contest.duration * 60 * 1000);
    if (now < contest.startTime || now > endTime) {
      return res.status(400).json({ error: 'Contest is not currently active' });
    }

    // Check problem index
    if (problemIndex < 0 || problemIndex >= contest.problems.length) {
      return res.status(400).json({ error: 'Invalid problem index' });
    }

    // Create submission as pending
    const submission = await Submission.create({
      user: req.user._id,
      contest: contestId,
      problemIndex,
      code,
      language,
      status: 'pending',
      points: 0,
    });

    // Log the submission
    await ActivityLog.create({
      user: req.user._id,
      contest: contestId,
      eventType: 'submission',
      details: `Submitted problem ${problemIndex + 1} (${language})`,
    });

    // Send immediate response with pending status
    res.status(201).json({
      submission: {
        id: submission._id,
        status: 'pending',
        message: 'Code submitted, evaluating...',
      },
    });

    // After 10 seconds, mark as accepted
    setTimeout(async () => {
      try {
        const points = contest.problems[problemIndex].points;
        await Submission.findByIdAndUpdate(submission._id, {
          status: 'accepted',
          points,
        });

        // Broadcast via ws
        const broadcast = req.app.get('broadcastToRoom');
        const broadcastLB = req.app.get('broadcastLeaderboardUpdate');
        if (broadcast) {
          broadcast(`contest:${contestId}`, 'submission-result', {
            submissionId: submission._id,
            userId: req.user._id,
            username: req.user.username,
            problemIndex,
            status: 'accepted',
            points,
          });
          if (broadcastLB) broadcastLB(contestId);
          broadcast(`admin:${contestId}`, 'activity-update', {
            eventType: 'submission',
            user: req.user.username,
            details: `Problem ${problemIndex + 1} accepted (+${points} pts)`,
            timestamp: new Date(),
          });
        }
      } catch (err) {
        console.error('Error updating submission:', err);
      }
    }, 10000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/submissions/auto-submit
// @desc    Auto-submit all unsaved code (triggered by proctoring violation)
// @access  Private
router.post('/auto-submit', protect, async (req, res) => {
  try {
    const { contestId, submissions } = req.body;
    // submissions = [{ problemIndex, code, language }]

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const results = [];

    if (submissions && Array.isArray(submissions)) {
      for (const sub of submissions) {
        const existing = await Submission.findOne({
          user: req.user._id,
          contest: contestId,
          problemIndex: sub.problemIndex,
          status: 'accepted',
        });

        if (!existing && sub.code && sub.code.trim()) {
          const submission = await Submission.create({
            user: req.user._id,
            contest: contestId,
            problemIndex: sub.problemIndex,
            code: sub.code,
            language: sub.language || 'cpp',
            status: 'accepted',
            points: contest.problems[sub.problemIndex]?.points || 0,
            isAutoSubmitted: true,
          });
          results.push(submission);
        }
      }
    }

    // Flag the user
    const alreadyFlagged = contest.flaggedUsers.some(
      (f) => f.user.toString() === req.user._id.toString()
    );
    if (!alreadyFlagged) {
      contest.flaggedUsers.push({
        user: req.user._id,
        reason: 'Proctoring violation - auto submitted',
      });
      await contest.save();
    }

    // Log
    await ActivityLog.create({
      user: req.user._id,
      contest: contestId,
      eventType: 'auto_submitted',
      details: `Auto-submitted ${results.length} problems due to proctoring violation`,
    });

    // Notify via ws
    const broadcast = req.app.get('broadcastToRoom');
    const broadcastLB = req.app.get('broadcastLeaderboardUpdate');
    if (broadcast) {
      broadcast(`admin:${contestId}`, 'activity-update', {
        eventType: 'flagged',
        user: req.user.username,
        details: 'User flagged and auto-submitted',
        timestamp: new Date(),
      });
      if (broadcastLB) broadcastLB(contestId);
    }

    res.json({ message: 'Auto-submitted', count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/submissions/contest/:id
// @desc    Get user's submissions for a contest
// @access  Private
router.get('/contest/:id', protect, async (req, res) => {
  try {
    const submissions = await Submission.find({
      user: req.user._id,
      contest: req.params.id,
    }).sort({ createdAt: -1 });

    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/submissions/:id/status
// @desc    Check submission status
// @access  Private
router.get('/:id/status', protect, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({
      id: submission._id,
      status: submission.status,
      points: submission.points,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
