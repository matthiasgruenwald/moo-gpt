/**
 * routes/costs.js — Cost-API-Endpunkte für Issue #68
 *
 * GET /api/activity/:activityId/cost-summary  (requireDashboardAuth)
 * GET /api/activity/:activityId/werkzeug-log  (requireDashboardAuth)
 * GET /api/admin/costs                        (requireAdminAuth)
 */

import { Router } from 'express';
import { requireDashboardAuth, requireAdminAuth } from '../auth-middleware.js';
import { getCostSummary, getStudentCostSummary, getWerkzeugLog, getAdminCostsByTeacher } from '../cost-service.js';

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

  router.get('/activity/:activityId/student-cost-summary', requireDashboardAuth, async (req, res) => {
    try {
      const summary = await getStudentCostSummary(req.activityId);
      res.json(summary);
    } catch (err) {
      console.log(`[Costs] student-cost-summary Fehler: ${err.message}`);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  // Admin-Endpunkt für student-cost-summary ohne activityId-Bindung
  router.get('/admin/student-cost-summary/:activityId', requireAdminAuth, async (req, res) => {
    try {
      const summary = await getStudentCostSummary(req.params.activityId);
      res.json(summary);
    } catch (err) {
      console.log(`[Costs] admin/student-cost-summary Fehler: ${err.message}`);
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

  // Admin-Endpunkt für werkzeug-log ohne activityId-Bindung (Token gehört zur eigenen Aktivität
  // des Admins, nicht zur angefragten — requireAdminAuth prüft nur isAdmin, nicht activityId)
  router.get('/admin/werkzeug-log/:activityId', requireAdminAuth, async (req, res) => {
    try {
      const log = await getWerkzeugLog(req.params.activityId);
      res.json(log);
    } catch (err) {
      console.log(`[Costs] admin/werkzeug-log Fehler: ${err.message}`);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  return router;
}
