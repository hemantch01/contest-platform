const url = require('url');
const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');

/**
 * WebSocket manager using the `ws` library.
 * Implements a custom JSON message protocol with rooms for contest/admin channels.
 *
 * Message format (both directions):
 *   { "event": "<event-name>", "data": { ... } }
 */

// In-memory room management
const rooms = new Map();          // roomId → Set<ws>
const clientMeta = new Map();     // ws → { userId, username, contestId, role }
const deadlineTimers = new Map(); // `${contestId}:${userId}` → timerId (local enforcement)

function addToRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
}

function removeFromRoom(roomId, ws) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(ws);
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
  }
}

function broadcastToRoom(roomId, event, data, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify({ event, data });
  for (const client of room) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(msg);
    }
  }
}

function sendTo(ws, event, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ event, data }));
  }
}

const WARNING_SECONDS = 10;
const DEADLINE_KEY_PREFIX = 'deadline'; // Redis key: deadline:{contestId}:{userId}

/**
 * Enforce a deadline stored in Redis via a local setTimeout.
 * If the user doesn't return in time, force-submit is triggered.
 */
function startDeadlineEnforcer(ws, redis, contestId, userId, meta, msRemaining) {
  const timerKey = `${contestId}:${userId}`;

  // Clear any existing local timer for this user
  if (deadlineTimers.has(timerKey)) {
    clearTimeout(deadlineTimers.get(timerKey));
  }

  const timerId = setTimeout(async () => {
    deadlineTimers.delete(timerKey);

    // Re-check Redis — the deadline may have been cancelled (user returned)
    const deadline = await redis.get(`${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`);
    if (!deadline) return; // User returned in time, deadline was cleared

    // Deadline still exists and has passed → force submit
    if (Date.now() >= parseInt(deadline)) {
      sendTo(ws, 'force-submit', { reason: 'Server-enforced warning timeout expired' });

      await ActivityLog.create({
        user: userId, contest: contestId,
        eventType: 'flagged',
        details: 'Did not return within 10 seconds (server-verified)',
      });

      broadcastToRoom(`admin:${contestId}`, 'activity-update', {
        eventType: 'flagged', user: meta.username,
        details: 'Warning timeout - server enforced auto submit',
        timestamp: new Date(),
      });

      // Cleanup the deadline key
      await redis.del(`${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`);
    }
  }, msRemaining + 500); // +500ms buffer to ensure deadline has truly passed

  deadlineTimers.set(timerKey, timerId);
}

function setupContestSocket(wss, redis) {
  wss.on('connection', async (ws, req) => {
    // ─── Authenticate via query param token ───
    const params = new url.URL(req.url, 'http://localhost').searchParams;
    const token = params.get('token');

    if (!token) {
      sendTo(ws, 'error', { message: 'Authentication required' });
      ws.close(4001, 'Authentication required');
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    } catch (err) {
      sendTo(ws, 'error', { message: 'Invalid token' });
      ws.close(4001, 'Invalid token');
      return;
    }

    const userId = decoded.id;
    clientMeta.set(ws, { userId, username: null, contestId: null, role: 'participant' });

    sendTo(ws, 'connected', { userId });

    // ─── Message handler ───
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return sendTo(ws, 'error', { message: 'Invalid JSON' });
      }

      const { event, data } = msg;
      const meta = clientMeta.get(ws);

      switch (event) {
        // ── Participant joins a contest room ──
        case 'join-contest': {
          const { contestId, username } = data;
          meta.contestId = contestId;
          meta.username = username;
          meta.role = 'participant';

          addToRoom(`contest:${contestId}`, ws);

          // Init warning count in Redis
          await redis.set(`warnings:${contestId}:${userId}`, '0', 'EX', 86400);

          // ── Check for any expired deadline from a previous session ──
          const existingDeadline = await redis.get(`${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`);
          if (existingDeadline && Date.now() >= parseInt(existingDeadline)) {
            // User reconnected AFTER the deadline passed → force submit immediately
            sendTo(ws, 'force-submit', { reason: 'Deadline expired during reconnection' });
            await redis.del(`${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`);

            await ActivityLog.create({
              user: userId, contest: contestId,
              eventType: 'flagged',
              details: 'Deadline expired before reconnection (server-verified)',
            });

            broadcastToRoom(`admin:${contestId}`, 'activity-update', {
              eventType: 'flagged', user: username,
              details: 'Reconnected after deadline expired', timestamp: new Date(),
            });
            break;
          } else if (existingDeadline) {
            // User reconnected but deadline hasn't passed yet → re-arm the enforcer
            const msRemaining = parseInt(existingDeadline) - Date.now();
            startDeadlineEnforcer(ws, redis, contestId, userId, meta, msRemaining);
            sendTo(ws, 'warning', {
              countdown: Math.ceil(msRemaining / 1000),
              message: 'Return to fullscreen! Timer still running.',
            });
          }

          await ActivityLog.create({
            user: userId, contest: contestId,
            eventType: 'joined', details: `${username} joined the contest`,
          });

          broadcastToRoom(`admin:${contestId}`, 'activity-update', {
            eventType: 'joined', user: username,
            details: 'User joined contest', timestamp: new Date(),
          });
          break;
        }

        // ── Admin joins the admin monitoring room ──
        case 'join-admin': {
          const { contestId } = data;
          meta.contestId = contestId;
          meta.role = 'admin';
          addToRoom(`admin:${contestId}`, ws);
          break;
        }

        // ── Proctoring violation ──
        case 'violation': {
          const { contestId, type } = data;
          const warningKey = `warnings:${contestId}:${userId}`;
          const deadlineKey = `${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`;
          const warnings = parseInt(await redis.get(warningKey) || '0');

          await ActivityLog.create({
            user: userId, contest: contestId,
            eventType: type === 'tab_switch' ? 'tab_switch' : 'fullscreen_exit',
            details: `Violation: ${type} (warning #${warnings + 1})`,
          });

          if (warnings === 0) {
            // First violation → set deadline in Redis & issue 10s warning
            await redis.set(warningKey, '1', 'EX', 86400);

            const deadlineMs = Date.now() + (WARNING_SECONDS * 1000);
            await redis.set(deadlineKey, deadlineMs.toString(), 'EX', WARNING_SECONDS + 5);

            sendTo(ws, 'warning', {
              countdown: WARNING_SECONDS,
              message: 'Return to fullscreen within 10 seconds!',
            });

            // Start server-side enforcement timer
            startDeadlineEnforcer(ws, redis, contestId, userId, meta, WARNING_SECONDS * 1000);

            await ActivityLog.create({
              user: userId, contest: contestId,
              eventType: 'warning_issued',
              details: `${WARNING_SECONDS} second warning issued (server-enforced)`,
            });

            broadcastToRoom(`admin:${contestId}`, 'activity-update', {
              eventType: 'warning_issued', user: meta.username,
              details: `Warning issued (${type}) - ${WARNING_SECONDS}s server deadline set`,
              timestamp: new Date(),
            });
          } else {
            // Second+ violation → force submit & flag
            await redis.del(deadlineKey); // Clean up any active deadline
            sendTo(ws, 'force-submit', { reason: 'Multiple proctoring violations' });

            broadcastToRoom(`admin:${contestId}`, 'activity-update', {
              eventType: 'flagged', user: meta.username,
              details: 'User flagged - multiple violations', timestamp: new Date(),
            });
          }
          break;
        }

        // ── Warning timer expired (client hint — server verifies) ──
        case 'warning-timeout': {
          const { contestId } = data;
          const deadlineKey = `${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`;

          // Don't blindly trust the client — verify against Redis
          const deadline = await redis.get(deadlineKey);
          if (!deadline) {
            // Deadline was already cleared (user returned or server already handled it)
            break;
          }

          if (Date.now() >= parseInt(deadline)) {
            // Server confirms: deadline has indeed passed
            await redis.del(deadlineKey);
            sendTo(ws, 'force-submit', { reason: 'Warning timeout expired (server-verified)' });

            await ActivityLog.create({
              user: userId, contest: contestId,
              eventType: 'flagged',
              details: 'Did not return within 10 seconds (server-verified)',
            });

            broadcastToRoom(`admin:${contestId}`, 'activity-update', {
              eventType: 'flagged', user: meta.username,
              details: 'Warning timeout - server verified auto submit',
              timestamp: new Date(),
            });
          }
          // else: client sent timeout early (trying to cheat?), ignore it
          break;
        }

        // ── User returned to fullscreen ──
        case 'returned-to-fullscreen': {
          const { contestId } = data;
          const deadlineKey = `${DEADLINE_KEY_PREFIX}:${contestId}:${userId}`;
          const timerKey = `${contestId}:${userId}`;

          // Cancel the server-side deadline
          await redis.del(deadlineKey);

          // Cancel the local enforcement timer
          if (deadlineTimers.has(timerKey)) {
            clearTimeout(deadlineTimers.get(timerKey));
            deadlineTimers.delete(timerKey);
          }

          broadcastToRoom(`admin:${contestId}`, 'activity-update', {
            eventType: 'reconnected', user: meta.username,
            details: 'Returned to fullscreen (deadline cancelled)',
            timestamp: new Date(),
          });
          break;
        }

        default:
          sendTo(ws, 'error', { message: `Unknown event: ${event}` });
      }
    });

    // ─── Disconnect handler ───
    ws.on('close', () => {
      const meta = clientMeta.get(ws);
      if (meta?.contestId) {
        removeFromRoom(`contest:${meta.contestId}`, ws);
        removeFromRoom(`admin:${meta.contestId}`, ws);

        // Clean up local timer (Redis deadline stays — checked on reconnect)
        const timerKey = `${meta.contestId}:${userId}`;
        if (deadlineTimers.has(timerKey)) {
          clearTimeout(deadlineTimers.get(timerKey));
          deadlineTimers.delete(timerKey);
        }

        if (meta.role === 'participant') {
          broadcastToRoom(`admin:${meta.contestId}`, 'activity-update', {
            eventType: 'disconnected', user: meta.username,
            details: 'User disconnected', timestamp: new Date(),
          });
        }
      }
      clientMeta.delete(ws);
    });
  });
}

// Utility for HTTP routes to broadcast leaderboard updates
function broadcastLeaderboardUpdate(contestId) {
  broadcastToRoom(`contest:${contestId}`, 'leaderboard-update', {});
}

module.exports = { setupContestSocket, broadcastToRoom, broadcastLeaderboardUpdate };
