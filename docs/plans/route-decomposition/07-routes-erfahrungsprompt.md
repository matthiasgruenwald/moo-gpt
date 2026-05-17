# Schritt 7: routes/erfahrungsprompt.js

Erfahrungsprompt-Verwaltung und KI-gestützte Prompt-Optimierung.

---

## Endpunkte (5)

| Methode | Pfad | Auth | Zeile (server.js) |
|---------|------|------|-------------------|
| GET | /api/erfahrungsprompt/:activityId | requireDashboardAuth | 466 |
| POST | /api/erfahrungsprompt/:activityId | requireDashboardAuth | 473 |
| GET | /api/erfahrungsprompt-history/:activityId | requireDashboardAuth | 483 |
| DELETE | /api/erfahrungsprompt-history/:id | requireDashboardAuth | 489 |
| POST | /api/optimize-prompt | requireDashboardAuth | 500 |

---

## Imports

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getActiveErfahrungsprompt, saveErfahrungsprompt,
  getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry,
} from '../db.js';
import { generateOptimizeProposal } from '../optimize.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';
```

---

## Vollständige Implementierung

```js
import { Router } from 'express';
import { requireDashboardAuth } from '../auth-middleware.js';
import {
  getActiveErfahrungsprompt, saveErfahrungsprompt,
  getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry,
} from '../db.js';
import { generateOptimizeProposal } from '../optimize.js';
import { aiClient } from '../ai-instance.js';
import { getCachedConfig } from '../config-cache.js';

const router = Router();

router.get('/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const erf = getActiveErfahrungsprompt(activityId);
  res.json({ content: erf?.content || '', version: erf?.version || 0 });
});

router.post('/erfahrungsprompt/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId, userId } = req;
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content fehlt' });
  saveErfahrungsprompt(activityId, content, userId);
  console.log(`[Erfahrungsprompt] Gespeichert für ${activityId} von ${userId}`);
  res.json({ ok: true });
});

router.get('/erfahrungsprompt-history/:activityId', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  res.json({ history: getErfahrungspromptHistory(activityId) });
});

router.delete('/erfahrungsprompt-history/:id', requireDashboardAuth, (req, res) => {
  const { activityId } = req;
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Ungültige ID' });
  const result = deleteErfahrungspromptHistoryEntry(activityId, id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, history: getErfahrungspromptHistory(activityId) });
});

router.post('/optimize-prompt', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const result = await generateOptimizeProposal(activityId, '', getCachedConfig(), aiClient);
    console.log(`[Optimize] Vorschlag für ${activityId} generiert (${result.kausalkette.length} Kausalketten-Einträge)`);
    res.json(result);
  } catch (e) {
    console.error('[Optimize] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
```

---

## Mounting in server.js

```js
import erfahrungspromptRouter from './routes/erfahrungsprompt.js';
app.use('/api', erfahrungspromptRouter);
```

---

## Entfernen aus server.js

Zeilen 207–252 (tatsächliche Position; die ursprünglichen Zeilennummern im Plan waren veraltet).

### Import-Cleanup in server.js

Nach der Extraktion können folgende Imports aus `server.js` entfernt werden, da sie nur von den 5 extrahierten Endpunkten verwendet wurden:

```js
// Aus dem db.js-Import entfernen:
saveErfahrungsprompt,
getErfahrungspromptHistory,
deleteErfahrungspromptHistoryEntry,

// Eigenen Import entfernen:
import { generateOptimizeProposal } from './optimize.js';
```

`getActiveErfahrungsprompt` bleibt im server.js-Import — es wird weiterhin in der Simulation (Zeile ~368) und im OneClick-Optimize (Zeile ~501) direkt verwendet.

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# GET /api/erfahrungsprompt/TEST?token=... → { content, version }
# POST /api/erfahrungsprompt/TEST?token=... { content: "Test-Prompt" } → { ok: true }
# GET /api/erfahrungsprompt-history/TEST?token=... → { history: [...] }
# POST /api/optimize-prompt?activityId=TEST&token=... → { kausalkette: [...] }
```
