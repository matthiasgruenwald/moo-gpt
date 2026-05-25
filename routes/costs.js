/**
 * routes/costs.js — Cost-API-Endpunkte für Issue #68
 *
 * GET /api/activity/:activityId/cost-summary  (requireDashboardAuth)
 * GET /api/activity/:activityId/werkzeug-log  (requireDashboardAuth)
 * GET /api/admin/costs                        (requireAdminAuth)
 */

import { Router } from 'express';
import { requireDashboardAuth, requireAdminAuth } from '../auth-middleware.js';
import { getCostSummary, getWerkzeugLog, getAdminCostsByTeacher } from '../cost-service.js';

export function createCostsRouter() {
  const router = Router();

  router.get('/activity/:activityId/cost-summary', requireDashboardAuth, async (req, res) => {
    try {
      const summary = await getCostSummary(req.activityId);
      res.json(summary);
    } catch (err) {
      console.log(`[Costs] cost-summary Fehler: ${err.message}`);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  router.get('/activity/:activityId/werkzeug-log', requireDashboardAuth, async (req, res) => {
    try {
      const log = await getWerkzeugLog(req.activityId);
      res.json(log);
    } catch (err) {
      console.log(`[Costs] werkzeug-log Fehler: ${err.message}`);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  router.get('/admin/costs', requireAdminAuth, async (req, res) => {
    try {
      const data = await getAdminCostsByTeacher();
      res.json(data);
    } catch (err) {
      console.log(`[Costs] admin/costs Fehler: ${err.message}`);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  return router;
}
