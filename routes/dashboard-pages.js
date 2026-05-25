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

// Issue #50: /dashboard leitet auf zuletzt besuchte Seite um (localStorage)
router.get('/dashboard', requireDashboardAuth, (req, res) => {
  const { activityId, token } = req.query;
  const qs = `activityId=${encodeURIComponent(activityId)}&token=${encodeURIComponent(token)}`;
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>moo-gpt – Dashboard</title>
</head>
<body>
<script>
  var last = localStorage.getItem('dashboard_last_page');
  var allowed = ['/dashboard/chats', '/dashboard/overview', '/dashboard/costs', '/dashboard/settings'];
  var target = (last && allowed.indexOf(last) !== -1) ? last : '/dashboard/chats';
  window.location.replace(target + '?${qs}');
</script>
</body>
</html>`);
});

router.get('/dashboard/chats', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'chats.html'));
});

router.get('/dashboard/overview', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'overview.html'));
});

router.get('/dashboard/costs', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'costs.html'));
});

router.get('/dashboard/settings', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(viewsDir, 'dashboard', 'settings.html'));
});

export default router;
