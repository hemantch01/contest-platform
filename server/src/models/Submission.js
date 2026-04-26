const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
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
  problemIndex: {
    type: Number,
    required: true,
  },
  code: {
    type: String,
    required: [true, 'Code is required'],
  },
  language: {
    type: String,
    required: true,
    enum: ['cpp', 'java', 'python', 'javascript', 'c'],
    default: 'cpp',
  },
  status: {
    type: String,
    enum: ['pending', 'accepted'],
    default: 'pending',
  },
  points: {
    type: Number,
    default: 0,
  },
  isAutoSubmitted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Compound index for efficient per-user-per-contest queries
submissionSchema.index({ user: 1, contest: 1, problemIndex: 1 });
submissionSchema.index({ contest: 1, status: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
