import crypto from 'crypto';
import { isAdmin } from './stores/admin.js';

const dashboardTokens = new Map(); // token → { activityId, userId, userName, expires }

export function isOriginAllowed(req) {
  if (!process.env.ALLOWED_ORIGIN) return true;
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim());
  return allowedOrigins.some(o => origin.startsWith(o));
}

export function generateDashboardToken(activityId, userId, userName = null) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  dashboardTokens.set(token, { activityId: String(activityId), userId, userName, expires });
  return token;
}

export function validateDashboardToken(token, activityId) {
  const entry = dashboardTokens.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expires) { dashboardTokens.delete(token); return false; }
  return entry.activityId === String(activityId);
}

setInterval(() => {
  const now = Date.now();
  for (const [t, v] of dashboardTokens) {
    if (now > v.expires) dashboardTokens.delete(t);
  }
}, 60 * 60 * 1000);

function getTokenData(token) {
  if (!token) return null;
  const entry = dashboardTokens.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expires) { dashboardTokens.delete(token); return null; }
  return entry;
}

export function getUserIdFromToken(token)   { return getTokenData(token)?.userId  ?? null; }
export function getUserNameFromToken(token) { return getTokenData(token)?.userName ?? null; }

export function requireTeacherAuth(req, res, next) {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId) return res.status(403).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

export function requireDashboardAuth(req, res, next) {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const activityId = req.params.activityId ?? req.query.activityId;
  const token = req.query.token;
  if (!activityId || !token || !validateDashboardToken(token, activityId))
    return res.status(403).json({ error: 'Forbidden' });
  req.activityId = activityId;
  req.userId = getUserIdFromToken(token);
  next();
}

export function requireAdminAuth(req, res, next) {
  if (!isOriginAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const userId = getUserIdFromToken(req.query.token);
  if (!userId || !isAdmin(userId)) return res.status(403).json({ error: 'Forbidden' });
  req.userId = userId;
  next();
}

/**
 * WebSocket-Middleware: prüft die Origin gegen ALLOWED_ORIGIN.
 * Sendet bei verbotener Origin einen Fehler-Frame und schließt den WS.
 *
 * @param {object} ws
 * @param {object} req
 * @param {Function} next
 */
export function checkOriginWs(ws, req, next) {
  const origin = req.headers.origin;
  if (process.env.ALLOWED_ORIGIN != undefined) {
    const allowedOrigins = process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim());
    const allowed = allowedOrigins.some(o => origin && origin.startsWith(o));
    if (!allowed) {
      ws.send(JSON.stringify({ end: true, messages: 'Error: Origin not allowed' }));
      ws.close(1008, 'Origin not allowed');
      return;
    }
  }
  next();
}
