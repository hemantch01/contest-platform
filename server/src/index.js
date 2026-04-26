const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const contestRoutes = require('./routes/contests');
const submissionRoutes = require('./routes/submissions');
const adminRoutes = require('./routes/admin');
const { setupContestSocket, broadcastLeaderboardUpdate, broadcastToRoom } = require('./socket/contestSocket');
const { csrfProtection, generateCsrfToken } = require('./middleware/csrf');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ─── Redis Client ───
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

// ─── WebSocket Server (ws library) ───
const wss = new WebSocketServer({ server, path: '/ws' });

// ─── Security Middleware ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(hpp());

// ─── Rate Limiting ───
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many auth attempts, please try again later' },
});

app.use(generalLimiter);

// ─── Body Parsing & CORS ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.CSRF_SECRET || 'csrf-secret'));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// ─── XSS Sanitization ───
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/[<>]/g, (c) => ({ '<': '&lt;', '>': '&gt;' }[c]));
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  next();
});

// ─── Logging ───
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Health Check ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── CSRF Token Endpoint ───
app.get('/api/csrf-token', generateCsrfToken);

// ─── Routes ───
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/contests', csrfProtection, contestRoutes);
app.use('/api/submissions', csrfProtection, submissionRoutes);
app.use('/api/admin', csrfProtection, adminRoutes);

// ─── Make ws broadcast functions accessible from routes ───
app.set('broadcastLeaderboardUpdate', broadcastLeaderboardUpdate);
app.set('broadcastToRoom', broadcastToRoom);

// ─── Error Handler ───
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ─── MongoDB Connection ───
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/contest-platform');
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// ─── Setup WebSocket ───
setupContestSocket(wss, redis);

// ─── Start Server ───
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 WebSocket server on ws://localhost:${PORT}/ws`);
  });
});

module.exports = { app, server };
