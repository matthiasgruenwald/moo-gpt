# Schritt 8: routes/personas.js

Lehrer-eigene und globale Personas inkl. KI-Vorschlagsgenerierung.
Admin-Personas wandern ebenfalls hierher (gleiche Domäne, nur höhere Auth).

---

## Endpunkte (7)

| Methode | Pfad | Auth | Zeile (server.js) |
|---------|------|------|-------------------|
| GET | /api/personas | requireTeacherAuth | 528 |
| POST | /api/personas | requireTeacherAuth | 534 |
| DELETE | /api/personas/:id | requireTeacherAuth | 544 |
| POST | /api/personas-suggest | requireDashboardAuth | 551 |
| GET | /api/admin/personas | requireAdminAuth | 575 |
| POST | /api/admin/personas | requireAdminAuth | 580 |
| DELETE | /api/admin/personas/:id | requireAdminAuth | 589 |
| PUT | /api/admin/personas/:id/promote | requireAdminAuth | 595 |

Hinweis: Die Admin-Personas stehen in `server.js` im Admin-Abschnitt (Zeilen 575–599),
werden aber hier gemeinsam verwaltet da sie dieselbe DB-Domäne betreffen.

---

## Imports

```js
import { Router } from 'express';
import { requireTeacherAuth, requireDashboardAuth, requireAdminAuth, getUserNameFromToken } from '../auth-middleware.js';
import {
  getGlobalPersonas, getTeacherPersonas, getAllPersonasForUser,
  createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped,
  getStudentMessages,
} from '../db.js';
import { aiClient } from '../ai-instance.js';
import { GEN_MODEL } from '../env-config.js';
```

---

## Vollständige Implementierung

```js
import { Router } from 'express';
import {
  requireTeacherAuth, requireDashboardAuth, requireAdminAuth, getUserNameFromToken,
} from '../auth-middleware.js';
import {
  getGlobalPersonas, getTeacherPersonas, getAllPersonasForUser,
  createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped,
  getStudentMessages,
} from '../db.js';
import { aiClient } from '../ai-instance.js';
import { GEN_MODEL } from '../env-config.js';

const router = Router();

router.get('/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  res.json({ global: getGlobalPersonas(), own: getTeacherPersonas(userId) });
});

router.post('/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  const teacherName = getUserNameFromToken(req.query.token);
  createPersona({ teacherId: userId, teacherName, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

router.delete('/personas/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  deletePersona(parseInt(req.params.id), userId, false);
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

router.post('/personas-suggest', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const { genModel } = req.body;
    const msgs   = getStudentMessages(activityId);
    const sample = msgs.slice(0, 60).map(m => m.content).join('\n---\n');
    const result = await aiClient.jsonCall(
      `Du analysierst Schüleräußerungen aus einer Lernaktivität und leitest typische Schüler-Personas ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "personas": [{ "name": "...", "description": "...", "example_msgs": "Beispiel 1|Beispiel 2|Beispiel 3" }] }
Leite 3–5 gut unterscheidbare Personas ab. Wenn keine Äußerungen vorliegen, erstelle generische Schüler-Typen für eine IGS Klasse 9.`,
      msgs.length ? `Schüler-Äußerungen:\n${sample}` : 'Noch keine Schüler-Äußerungen vorhanden. Erstelle typische Klasse-9-Personas.',
      genModel || GEN_MODEL
    );
    res.json({ suggestions: result.personas || [] });
  } catch (e) {
    console.error('[Personas-Suggest] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/personas', requireAdminAuth, (req, res) => {
  res.json({ personas: getAllTeacherPersonasGrouped() });
});

router.post('/admin/personas', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  createPersona({ teacherId: null, teacherName: null, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, global: getGlobalPersonas() });
});

router.delete('/admin/personas/:id', requireAdminAuth, (req, res) => {
  deletePersona(parseInt(req.params.id), null, true);
  res.json({ ok: true });
});

router.put('/admin/personas/:id/promote', requireAdminAuth, (req, res) => {
  const { userId } = req;
  promotePersonaToGlobal(parseInt(req.params.id), userId);
  res.json({ ok: true, global: getGlobalPersonas() });
});

export default router;
```

---

## Koordination mit routes/admin.js (Schritt 5)

In `05-routes-admin.md` werden die Admin-Personas **nicht** extrahiert —
die 4 `/api/admin/personas/*`-Endpunkte kommen hierher.

In `routes/admin.js` also **nicht** aufnehmen:
- GET /api/admin/personas
- POST /api/admin/personas
- DELETE /api/admin/personas/:id
- PUT /api/admin/personas/:id/promote

---

## Mounting in server.js

```js
import personasRouter from './routes/personas.js';
app.use('/api', personasRouter);
```

---

## Entfernen aus server.js

Zeilen 528–599.

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# GET /api/personas?token=... → { global: [...], own: [...] }
# POST /api/personas-suggest?activityId=TEST&token=... → { suggestions: [...] }
# GET /api/admin/personas?token=... → { personas: [...] }
```
