# Schritt 9: routes/criteria.js

Bewertungskriterien, Erkenntnisse und Schüler-Feedback.
Drei inhaltlich verwandte Domänen, alle um Qualitätsbewertung von Chat-Antworten.

---

## Endpunkte (8)

| Methode | Pfad | Auth | Zeile (server.js) |
|---------|------|------|-------------------|
| GET | /api/criteria/:activityId | requireDashboardAuth | 623 |
| POST | /api/criteria-suggest/:activityId | requireDashboardAuth | 629 |
| POST | /api/criteria/:activityId | requireDashboardAuth | 641 |
| DELETE | /api/criteria/:id | requireDashboardAuth | 650 |
| PATCH | /api/criteria/:id/restore | requireDashboardAuth | 657 |
| POST | /api/erkenntnisse | requireDashboardAuth | 513 |
| POST | /api/feedback | requireDashboardAuth | 900 |
| GET | /api/feedback/:activityId | requireDashboardAuth | 915 |

---

## Imports

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion,
  saveErkenntnisse, saveFeedback, getFeedbackByActivity,
} from '../db.js';
import { suggestCriteriaList } from '../criteria.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';
```

---

## Vollständige Implementierung

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion,
  saveErkenntnisse, saveFeedback, getFeedbackByActivity,
} from '../db.js';
import { suggestCriteriaList } from '../criteria.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';

const router = Router();

router.get('/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ criteria: getCriteria(activityId), deletedCriteria: getDeletedCriteria(activityId) });
});

router.post('/criteria-suggest/:activityId', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const suggestions = await suggestCriteriaList(activityId, getCachedConfig(), req.body.genModel, aiClient);
    res.json({ suggestions });
  } catch (e) {
    console.error('[Criteria] Suggest-Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/criteria/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content fehlt' });
  saveErkenntnisse(activityId, content, 'criteria');
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.delete('/criteria/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  softDeleteCriterion(parseInt(req.params.id));
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.patch('/criteria/:id/restore', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  restoreCriterion(parseInt(req.params.id));
  res.json({
    ok: true,
    criteria:        getCriteria(activityId),
    deletedCriteria: getDeletedCriteria(activityId),
  });
});

router.post('/erkenntnisse', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items-Array fehlt' });
  for (const item of items) {
    const text = [item.problem, item.ursache, item.aenderung].filter(Boolean).join(' → ');
    if (text) saveErkenntnisse(activityId, text, 'ai');
  }
  res.json({ ok: true, saved: items.length });
});

router.post('/feedback', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { messageId, threadId, rating, comment, improvedText } = req.body;
  if (!messageId || !['gut', 'schlecht'].includes(rating))
    return res.status(400).json({ error: 'messageId und rating (gut|schlecht) erforderlich' });
  try {
    saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy: userId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Feedback] Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.get('/feedback/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  try {
    res.json({ feedback: getFeedbackByActivity(activityId) });
  } catch (e) {
    console.error('[Feedback] Ladefehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

export default router;
```

---

## Mounting in server.js

```js
import criteriaRouter from './routes/criteria.js';
app.use('/api', criteriaRouter);
```

---

## Entfernen aus server.js

Die Zeilennummern im Plan sind veraltet. Aktuelle Positionen (Stand Mai 2026):

- Zeilen 210–220 (`/api/erkenntnisse`)
- Zeilen 223–264 (`/api/criteria/*`)
- Zeilen 462–488 (`/api/feedback`)

### Import-Cleanup in server.js

Nach Schritt 9 können folgende Imports entfernt werden:

| Import | Entfernen? | Grund |
|--------|-----------|-------|
| `suggestCriteriaList` (von `./criteria.js`) | ✅ ja | nur von criteria-Routes genutzt |
| `augmentCriteria` (von `./criteria.js`) | ❌ nein | simulate-Endpunkt (Schritt 10) braucht es noch |
| `getDeletedCriteria` (von `./db.js`) | ✅ ja | nur criteria-Routes |
| `softDeleteCriterion` (von `./db.js`) | ✅ ja | nur criteria-Routes |
| `restoreCriterion` (von `./db.js`) | ✅ ja | nur criteria-Routes |
| `saveFeedback` (von `./db.js`) | ✅ ja | nur feedback-Routes |
| `getFeedbackByActivity` (von `./db.js`) | ✅ ja | nur feedback-Routes |
| `getCriteria` (von `./db.js`) | ❌ nein | simulate (Zeilen ~276, ~409) |
| `saveErkenntnisse` (von `./db.js`) | ❌ nein | simulate (Zeile ~398) |

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# GET /api/criteria/TEST?token=... → { criteria: [...], deletedCriteria: [...] }
# POST /api/erkenntnisse?activityId=TEST&token=... { items: [{problem:"X",ursache:"Y",aenderung:"Z"}] }
# POST /api/feedback?activityId=TEST&token=... { messageId: 1, rating: "gut" } → { ok: true }
```
