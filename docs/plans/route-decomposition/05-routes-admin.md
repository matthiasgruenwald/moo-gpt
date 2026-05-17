# Schritt 5: routes/admin.js ✓ erledigt

Admin-Verwaltung: System-Prompt, Prompt-History, Admin-Liste, System-Template,
Admin-Personas, Logs und Dienst-Neustart.

---

## Endpunkte (15)

| Methode | Pfad | Auth |
|---------|------|------|
| GET | /api/admin/config | requireTeacherAuth |
| PUT | /api/admin/config | requireAdminAuth |
| GET | /api/admin/prompt-history | requireAdminAuth |
| DELETE | /api/admin/prompt-history/:id | requireAdminAuth |
| GET | /api/admin/admins | requireAdminAuth |
| POST | /api/admin/admins | requireAdminAuth |
| DELETE | /api/admin/admins/:targetId | requireAdminAuth |
| GET | /api/admin/system-template | requireTeacherAuth |
| PUT | /api/admin/system-template | requireAdminAuth |
| GET | /api/admin/personas | requireAdminAuth |
| POST | /api/admin/personas | requireAdminAuth |
| DELETE | /api/admin/personas/:id | requireAdminAuth |
| PUT | /api/admin/personas/:id/promote | requireAdminAuth |
| GET | /api/admin/logs | requireAdminAuth |
| POST | /api/admin/restart | requireAdminAuth |

---

## Besonderheit: cachedConfig-Mutation

PUT /api/admin/config **schreibt** `cachedConfig` und broadcastet an das Dashboard.
Das ist der einzige Schreibzugriff auf `cachedConfig` im gesamten Projekt.

```js
// Vorher (server.js):
cachedConfig = { content: systemPrompt, model };
dashboardRegistry.broadcastAll({ type: 'configUpdated', model, updatedBy: userId });

// Nachher (routes/admin.js):
updateCachedConfig(systemPrompt, model);
// dashboardRegistry.broadcastAll(...)  ← Problem: dashboardRegistry ist in server.js
```

**Lösung:** `dashboardRegistry` als Parameter an den Admin-Router übergeben.
Damit wird admin.js eine Factory — oder `dashboardRegistry` wird exportiert.

Da `dashboardRegistry` schon dem Dashboard-WS-Handler übergeben wird und auch
dem Activity-Router (via `createActivityRouter`), ist das etablierte Muster.

**Factory-Signatur:**
```js
export function createAdminRouter({ dashboardRegistry })
```

---

## Imports

```js
import { Router } from 'express';
import { execFileSync, execFile } from 'child_process';
import { requireAdminAuth, requireTeacherAuth } from '../auth-middleware.js';
import {
  isAdmin, addAdmin, removeAdmin, getAdmins,
  saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry,
  getSystemTemplate, setSystemTemplate,
  getAllTeacherPersonasGrouped, getGlobalPersonas, createPersona, deletePersona, promotePersonaToGlobal,
  getTeacherPreference,
} from '../db.js';
import { getCachedConfig, updateCachedConfig } from '../config-cache.js';
import { AVAILABLE_MODELS, GEN_MODELS } from '../env-config.js';
import { validateTemplateFields } from './validators.js';
```

---

## Vollständige Implementierung (Skelett)

```js
export function createAdminRouter({ dashboardRegistry }) {
  const router = Router();

  router.get('/admin/config', requireTeacherAuth, (req, res) => {
    const { userId } = req;
    const config = getCachedConfig();
    const pref   = getTeacherPreference(userId);
    res.json({
      systemPrompt:    config.content,
      model:           config.model,
      availableModels: AVAILABLE_MODELS,
      genModels:       GEN_MODELS,
      isAdmin:         isAdmin(userId),
      myModel:         pref?.preferred_model || null,
    });
  });

  router.put('/admin/config', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { systemPrompt, model } = req.body;
    if (typeof systemPrompt !== 'string') return res.status(400).json({ error: 'systemPrompt fehlt' });
    if (!model || !AVAILABLE_MODELS.includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });
    saveSystemPrompt(systemPrompt, model, userId);
    updateCachedConfig(systemPrompt, model);
    dashboardRegistry.broadcastAll({ type: 'configUpdated', model, updatedBy: userId });
    console.log(`[Admin] Systemprompt + Modell gespeichert von ${userId}, Modell: ${model}`);
    res.json({ ok: true });
  });

  router.get('/admin/prompt-history', requireAdminAuth, (req, res) => {
    res.json({ history: getPromptHistory() });
  });

  router.delete('/admin/prompt-history/:id', requireAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Ungültige ID' });
    const result = deletePromptHistoryEntry(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, history: getPromptHistory() });
  });

  router.get('/admin/admins', requireAdminAuth, (req, res) => {
    res.json({ admins: getAdmins() });
  });

  router.post('/admin/admins', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { newUserId } = req.body;
    if (!newUserId || typeof newUserId !== 'string') return res.status(400).json({ error: 'newUserId fehlt' });
    addAdmin(newUserId.trim(), userId);
    console.log(`[Admin] ${newUserId} als Admin eingetragen von ${userId}`);
    res.json({ ok: true, admins: getAdmins() });
  });

  router.delete('/admin/admins/:targetId', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const targetId = req.params.targetId;
    if (targetId === userId) return res.status(400).json({ error: 'Eigene Admin-Rechte nicht entziehbar' });
    removeAdmin(targetId);
    console.log(`[Admin] ${targetId} als Admin entfernt von ${userId}`);
    res.json({ ok: true, admins: getAdmins() });
  });

  router.get('/admin/system-template', requireTeacherAuth, (req, res) => {
    const tpl = getSystemTemplate();
    res.json({
      title:         tpl?.title          ?? '',
      botIcon:       tpl?.bot_icon       ?? 'grw',
      opener:        tpl?.opener         ?? '',
      uploadMode:    tpl?.upload_mode    ?? 'off',
      hintsTemplate: tpl?.hints_template ?? '',
    });
  });

  router.put('/admin/system-template', requireAdminAuth, (req, res) => {
    const { userId } = req;
    const { title, botIcon, opener, uploadMode, hintsTemplate } = req.body;
    const validErr = validateTemplateFields(uploadMode, botIcon);
    if (validErr) return res.status(400).json({ error: validErr });
    setSystemTemplate({ title, botIcon, opener, uploadMode, hintsTemplate });
    console.log(`[P5b] Systemvorlage gespeichert von ${userId}`);
    res.json({ ok: true });
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

  router.get('/admin/logs', requireAdminAuth, (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.n) || 100, 1), 2000);
    try {
      const out = execFileSync(
        'journalctl',
        ['-u', 'moo-gpt', '-n', String(n), '--no-pager', '--output=short-iso'],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      res.json({ lines: out.split('\n').filter(l => l.length > 0) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/restart', requireAdminAuth, (req, res) => {
    res.json({ ok: true });
    setTimeout(() => execFile('systemctl', ['restart', 'moo-gpt'], () => {}), 500);
  });

  return router;
}
```

---

## Mounting in server.js

```js
import { createAdminRouter } from './routes/admin.js';

const adminRouter = createAdminRouter({ dashboardRegistry });
app.use('/api', adminRouter);
```

---

## Entfernen aus server.js

Blöcke per Kommentar-Marker lokalisieren (Zeilennummern sind nach vorherigen
Refaktorierungsschritten nicht mehr aktuell):

| Marker in server.js | Enthält |
|---|---|
| `// ── Issue #17: Admin/Teacher-Config-Endpunkte` | GET+PUT /admin/config, GET+DELETE /admin/prompt-history, GET+POST+DELETE /admin/admins |
| `// ── P5b: Systemvorlage (Admin)` | GET+PUT /admin/system-template |
| `// ── P6: Admin Personas` | GET+POST+DELETE+PUT /admin/personas |
| `// ── P8: Admin-Debug-Endpunkte` | GET /admin/logs, POST /admin/restart |

Auch: Import von `execFileSync`, `execFile` aus `child_process` aus `server.js`
entfernen — beide werden ausschließlich in den Admin-Routen genutzt (verifiziert).

---

## Smoke-Test

```bash
systemctl restart moo-gpt
# GET /api/admin/config?token=... → systemPrompt, availableModels
# PUT /api/admin/config?token=... { systemPrompt, model } → { ok: true }
# → journalctl zeigt "[Admin] Systemprompt + Modell gespeichert"
# GET /api/admin/logs?token=... → { lines: [...] }
```
