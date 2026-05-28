/**
 * routes/dashboard-ws.js — Issue #75
 *
 * Dashboard-WebSocket-Handler, ausgelagert aus server.js.
 *
 * Exportiert:
 *   createDashboardWsRouter({ dashboardRegistry, lockManager })
 *     → Express-Router mit router.ws('/api/dashboard-ws', ...)
 *
 *   createDashboardWsHandler(deps)
 *     → reiner (ws, req)-Handler für Tests (alle Deps injiziert)
 */

import { Router } from 'express';
import {
  isOriginAllowed,
  validateDashboardToken,
  getUserIdFromToken,
  getUserNameFromToken,
} from '../auth-middleware.js';
import { getActivity, setTeacherIfUnset } from '../stores/activity.js';
import { getStudents, enrichStudentsWithCost } from '../stores/dashboard.js';
import { enrichMessagesWithCost } from '../token-log.js';
import { computeActivityCost, computeThreadCost } from '../cost-service.js';
import { getMessages } from '../stores/chat.js';

/**
 * Erstellt den reinen (ws, req)-Handler.
 * Alle Abhängigkeiten werden als Objekt injiziert — erleichtert Tests.
 *
 * @param {object} deps
 * @param {object} deps.dashboardRegistry
 * @param {object} deps.lockManager
 * @param {Function} deps.isOriginAllowed
 * @param {Function} deps.validateDashboardToken
 * @param {Function} deps.getUserIdFromToken
 * @param {Function} deps.getUserNameFromToken
 * @param {Function} deps.setTeacherIfUnset
 * @param {Function} deps.getActivity
 * @param {Function} deps.getStudents
 * @param {Function} deps.enrichStudentsWithCost
 * @param {Function} deps.computeActivityCost
 * @param {Function} deps.enrichMessagesWithCost
 * @param {Function} deps.computeThreadCost
 * @param {Function} deps.getMessages
 */
export function createDashboardWsHandler(deps) {
  const {
    dashboardRegistry,
    lockManager,
    isOriginAllowed:        _isOriginAllowed,
    validateDashboardToken: _validateDashboardToken,
    getUserIdFromToken:     _getUserIdFromToken,
    getUserNameFromToken:   _getUserNameFromToken,
    setTeacherIfUnset:      _setTeacherIfUnset,
    getActivity:            _getActivity,
    getStudents:            _getStudents,
    enrichStudentsWithCost: _enrichStudentsWithCost,
    computeActivityCost:    _computeActivityCost,
    enrichMessagesWithCost: _enrichMessagesWithCost,
    computeThreadCost:      _computeThreadCost,
    getMessages:            _getMessages,
  } = deps;

  return function dashboardWsHandler(ws, req) {
    if (!_isOriginAllowed(req)) {
      ws.close(1008, 'Origin not allowed');
      return;
    }

    const params     = new URLSearchParams((req.url || '').split('?')[1] || '');
    const activityId = params.get('activityId');
    const token      = params.get('token');

    // Token-Validierung (Issue #5: Zugriffsschutz)
    if (!activityId || !token || !_validateDashboardToken(token, activityId)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      console.log(`[Dashboard] Ungültiger Token für activityId=${activityId}`);
      return;
    }

    // Issue #63: Lehrer beim ersten Dashboard-Aufruf als Eigentümer eintragen
    const teacherId   = _getUserIdFromToken(token);
    const teacherName = _getUserNameFromToken(token);
    _setTeacherIfUnset(activityId, teacherId, teacherName);

    // Registrieren
    dashboardRegistry.register(activityId, ws);
    console.log(`[Dashboard] Lehrer verbunden, activityId=${activityId}`);

    // Initialliste + Aufgabentitel + Kosten senden (Issue #12)
    (async () => {
      try {
        const [students, activityCost] = await Promise.all([
          _enrichStudentsWithCost(_getStudents(activityId)),
          _computeActivityCost(activityId),
        ]);
        const act = _getActivity(activityId);
        ws.send(JSON.stringify({
          type: 'students',
          data: students,
          activityName: act?.activity_name,
          opener:       act?.opener,
          activityCost,
          locked:       lockManager.isLocked(activityId),
        }));
      } catch (e) {
        console.error('[Dashboard] Initial-students error:', e);
      }
    })();

    // Nachrichten-Anfrage vom Dashboard-Client
    ws.on('message', (msg) => {
      try {
        const obj = JSON.parse(msg);
        if (obj.type === 'getMessages' && obj.threadDbId) {
          const threadDbId = parseInt(obj.threadDbId);
          const students = _getStudents(activityId);
          const student = students.find(s => s.thread_db_id === threadDbId);
          if (!student) {
            ws.send(JSON.stringify({ type: 'error', message: 'Forbidden' }));
            return;
          }
          Promise.all([
            _enrichMessagesWithCost(_getMessages(threadDbId)),
            _computeThreadCost(threadDbId),
          ]).then(([messages, threadCost]) => {
            ws.send(JSON.stringify({ type: 'messages', threadDbId, student, data: messages, threadCost }));
          }).catch(e => {
            console.error('[Dashboard] enrichMessages error:', e);
          });
        }
      } catch (e) {
        console.error('[Dashboard] WS message error:', e);
      }
    });

    ws.on('close', () => {
      dashboardRegistry.unregister(activityId, ws);
      console.log(`[Dashboard] Lehrer getrennt, activityId=${activityId}`);
    });
  };
}

/**
 * DI-Factory für den Express-Router (Produktionseinsatz).
 * Entspricht dem Pattern von createActivityRouter / createAdminRouter.
 *
 * @param {object} deps
 * @param {object} deps.dashboardRegistry
 * @param {object} deps.lockManager
 */
export function createDashboardWsRouter({ dashboardRegistry, lockManager }) {
  const router = Router();

  const handler = createDashboardWsHandler({
    dashboardRegistry,
    lockManager,
    isOriginAllowed,
    validateDashboardToken,
    getUserIdFromToken,
    getUserNameFromToken,
    setTeacherIfUnset,
    getActivity,
    getStudents,
    enrichStudentsWithCost,
    computeActivityCost,
    enrichMessagesWithCost,
    computeThreadCost,
    getMessages,
  });

  router.ws('/api/dashboard-ws', handler);

  return router;
}
