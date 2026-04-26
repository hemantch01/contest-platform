const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  contest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contest',
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'joined',
      'tab_switch',
      'fullscreen_exit',
      'warning_issued',
      'auto_submitted',
      'flagged',
      'submission',
      'reconnected',
      'disconnected',
    ],
  },
  details: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound index for contest activity feed
activityLogSchema.index({ contest: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
