const { validationResult, body, param } = require('express-validator');

// Run validation and return errors if any
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ─── Auth Validators ───
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, underscores'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  validate,
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate,
];

// ─── Contest Validators ───
const contestValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be 3-100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be 10-2000 characters'),
  body('visibility')
    .isIn(['public', 'private'])
    .withMessage('Visibility must be public or private'),
  body('startTime')
    .isISO8601()
    .withMessage('Valid start time is required'),
  body('duration')
    .isInt({ min: 5, max: 600 })
    .withMessage('Duration must be 5-600 minutes'),
  body('problems')
    .isArray({ min: 1 })
    .withMessage('At least one problem is required'),
  body('problems.*.title')
    .trim()
    .notEmpty()
    .withMessage('Problem title is required'),
  body('problems.*.description')
    .trim()
    .notEmpty()
    .withMessage('Problem description is required'),
  body('problems.*.points')
    .isInt({ min: 1 })
    .withMessage('Points must be at least 1'),
  validate,
];

// ─── Submission Validators ───
const submissionValidation = [
  body('contestId')
    .isMongoId()
    .withMessage('Valid contest ID is required'),
  body('problemIndex')
    .isInt({ min: 0 })
    .withMessage('Valid problem index is required'),
  body('code')
    .notEmpty()
    .withMessage('Code is required'),
  body('language')
    .isIn(['cpp', 'java', 'python', 'javascript', 'c'])
    .withMessage('Invalid language'),
  validate,
];

// ─── Param Validators ───
const mongoIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  validate,
];

module.exports = {
  registerValidation,
  loginValidation,
  contestValidation,
  submissionValidation,
  mongoIdParam,
};
