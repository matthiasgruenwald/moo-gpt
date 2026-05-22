/**
 * Dashboard HTML-Seiten-Routen (Issue #44)
 *
 * Liefert die statischen Dashboard-HTML-Seiten unter geschützten URLs.
 * Auth via requireDashboardAuth (activityId + token in Query-Params).
 */
import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireDashboardAuth } from '../auth-middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, '..', 'views');

const router = Router();

// Bestehende /dashboard-Route leitet auf /dashboard/chats um
router.get('/dashboard', requireDashboardAuth, (req, res) => {
  const { activityId, token } = req.query;
  res.redirect(`/dashboard/chats?activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`);
});

router.get('/dashboard/chats', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'chats.html'));
});

router.get('/dashboard/overview', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'overview.html'));
});

router.get('/dashboard/settings', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'settings.html'));
});

export default router;
