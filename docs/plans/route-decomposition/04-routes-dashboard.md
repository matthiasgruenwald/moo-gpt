# Schritt 4: routes/dashboard.js

HTTP-Endpunkte für das Lehrer-Dashboard (Schülerliste und Nachrichten).

---

## Endpunkte

| Methode | Pfad | Auth | Zeile (server.js) |
|---------|------|------|-------------------|
| GET | /api/dashboard/students | requireDashboardAuth | 271 |
| GET | /api/dashboard/messages/:threadDbId | requireDashboardAuth | 284 |

Hinweis: Der Dashboard-WebSocket (`app.ws('/api/dashboard-ws', ...)`) bleibt in `server.js`,
da er `dashboardRegistry` und `activityLocks` direkt braucht.

---

## Mitziehende Hilfsfunktion: `enrichStudentsWithCost`

Aktuell in `server.js` (Zeile 194–199), wird nur vom Dashboard-WS-Handler und
von GET /api/dashboard/students genutzt.

```js
function enrichStudentsWithCost(students) {
  return students.map(s => ({
    ...s,
    threadCost: computeRunCost(s.cost_prompt || 0, s.cost_completion || 0),
  }));
}
```

Sie zieht in `routes/dashboard.js`. Der Dashboard-WS-Handler in `server.js` importiert
sie von dort.

---

## Imports

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getStudents, getActivity, getMessages } from '../db.js';
import {
  enrichMessagesWithCost, computeThreadCost, computeRunCost,
} from '../token-log.js';
```

---

## Vollständige Implementierung

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import { getStudents, getActivity, getMessages } from '../db.js';
import { enrichMessagesWithCost, computeThreadCost, computeRunCost } from '../token-log.js';

export function enrichStudentsWithCost(students) {
  return students.map(s => ({
    ...s,
    threadCost: computeRunCost(s.cost_prompt || 0, s.cost_completion || 0),
  }));
}

const router = Router();

router.get('/dashboard/students', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  try {
    const students = getStudents(activityId);
    const act      = getActivity(activityId);
    res.json({ students, activityName: act?.activity_name, opener: act?.opener });
  } catch (e) {
    console.error('[Dashboard] getStudents error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/dashboard/messages/:threadDbId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const threadDbId = parseInt(req.params.threadDbId);
  if (isNaN(threadDbId)) return res.status(400).json({ error: 'Invalid threadDbId' });
  try {
    const students = getStudents(activityId);
    const student  = students.find(s => s.thread_db_id === threadDbId);
    if (!student) return res.status(403).json({ error: 'Forbidden' });
    const messages   = enrichMessagesWithCost(getMessages(threadDbId));
    const threadCost = computeThreadCost(threadDbId);
    res.json({ student, messages, threadCost });
  } catch (e) {
    console.error('[Dashboard] getMessages error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
```

---

## Mounting in server.js

```js
import dashboardRouter, { enrichStudentsWithCost } from './routes/dashboard.js';
app.use('/api', dashboardRouter);
```

`enrichStudentsWithCost` wird weiterhin vom Dashboard-WS-Handler gebraucht (Zeile 951).

---

## Entfernen aus server.js

Nach erfolgreichem Test:
- Zeilen 194–199 (`enrichStudentsWithCost`-Definition)
- Zeilen 271–299 (GET /api/dashboard/students + GET /api/dashboard/messages)

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# GET /api/dashboard/students?activityId=TEST&token=... → { students: [...] }
# GET /api/dashboard/messages/1?activityId=TEST&token=... → { student, messages, threadCost }
# Dashboard-WebSocket verbinden → initiale Schülerliste ankommen
```
