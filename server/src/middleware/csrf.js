const crypto = require('crypto');

const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret-key';

// Generate a CSRF token and set it as a cookie
const generateCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');

  res.cookie('csrf-token', token, {
    httpOnly: false, // Must be readable by JS to send in header
    sameSite: 'lax',
    secure: false, // HTTP only as per requirements
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  res.json({ csrfToken: token });
};

// Validate CSRF token using double-submit cookie pattern
const csrfProtection = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token mismatch' });
  }

  next();
};

module.exports = { generateCsrfToken, csrfProtection };
