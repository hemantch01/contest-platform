const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Problem title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Problem description is required'],
  },
  points: {
    type: Number,
    required: true,
    default: 100,
    min: [1, 'Points must be at least 1'],
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  },
});

const contestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Contest title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters'],
  },
  description: {
    type: String,
    required: [true, 'Contest description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  allowedEmails: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  shareCode: {
    type: String,
    unique: true,
    default: () => uuidv4().split('-')[0],
    index: true,
  },
  problems: [problemSchema],
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
  },
  duration: {
    type: Number,
    required: [true, 'Duration is required (in minutes)'],
    min: [5, 'Duration must be at least 5 minutes'],
  },
  registeredUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  flaggedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: String,
    flaggedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual: endTime
contestSchema.virtual('endTime').get(function () {
  if (this.startTime && this.duration) {
    return new Date(this.startTime.getTime() + this.duration * 60 * 1000);
  }
  return null;
});

// Virtual: status
contestSchema.virtual('status').get(function () {
  const now = new Date();
  if (now < this.startTime) return 'upcoming';
  const end = new Date(this.startTime.getTime() + this.duration * 60 * 1000);
  if (now >= this.startTime && now <= end) return 'live';
  return 'ended';
});

// Index for efficient queries
contestSchema.index({ startTime: 1 });
contestSchema.index({ visibility: 1, startTime: -1 });

module.exports = mongoose.model('Contest', contestSchema);
