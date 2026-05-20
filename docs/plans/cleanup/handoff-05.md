# Handoff: Schritt 05 – LockManager

**Branch:** `cleanup/code-struktur`
**Ziel:** Aktivitätssperren aus `server.js` + `routes/activity.js` in `lock-manager.js` kapseln.
**Verhaltensänderung:** keine.

Vollständige Analyse: `docs/plans/cleanup/05-lock-manager.md`

---

## Was zu tun ist

### 1. Neue Datei `lock-manager.js` anlegen

```js
export class LockManager {
  #locks = new Map();
  #chatRegistry;
  #dashboardRegistry;

  constructor(chatRegistry, dashboardRegistry) {
    this.#chatRegistry     = chatRegistry;
    this.#dashboardRegistry = dashboardRegistry;
  }

  lock(activityId, durationMinutes = 0) {
    const id = String(activityId);
    const existing = this.#locks.get(id);
    if (existing?.timerHandle) clearTimeout(existing.timerHandle);

    const entry = {};
    const mins = Math.min(120, Math.max(0, Number(durationMinutes) || 0));
    if (mins > 0) {
      entry.timerHandle = setTimeout(() => {
        this.#locks.delete(id);
        this.#chatRegistry.broadcast(activityId,     { type: 'unlocked' });
        this.#dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
        console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${mins} min`);
      }, mins * 60 * 1000);
    }

    this.#locks.set(id, entry);
    this.#chatRegistry.broadcast(activityId,     { type: 'locked' });
    this.#dashboardRegistry.broadcast(activityId, { type: 'locked' });
  }

  unlock(activityId) {
    const id = String(activityId);
    const existing = this.#locks.get(id);
    if (!existing) return;
    if (existing.timerHandle) clearTimeout(existing.timerHandle);
    this.#locks.delete(id);
    this.#chatRegistry.broadcast(activityId,     { type: 'unlocked' });
    this.#dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
  }

  isLocked(activityId) {
    return this.#locks.has(String(activityId));
  }
}
```

---

### 2. `server.js` — 4 chirurgische Änderungen

**Zeile 35** — Import hinzufügen (nach `simulationRouter`-Import):
```diff
+import { LockManager } from './lock-manager.js';
```

**Zeile 141–142** — `new Map()` ersetzen:
```diff
-/** P3: activityId → { timerHandle? } für Plenum-Sperre. */
-const activityLocks = new Map();
+const lockManager = new LockManager(chatRegistry, dashboardRegistry);
```

**Zeile 177** — `createActivityRouter`-Aufruf:
```diff
-const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks });
+const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, lockManager });
```

**Zeile 245** — Initialzustand Dashboard-Client:
```diff
-      locked:       activityLocks.has(activityId),
+      locked:       lockManager.isLocked(activityId),
```

**Zeile 283** — ChatSession-Deps:
```diff
-      chatRegistry, activityLocks, generateDashboardToken,
+      chatRegistry, lockManager, generateDashboardToken,
```

---

### 3. `routes/activity.js` — Signatur + Lock/Unlock-Body ersetzen

**Zeile 9** — Funktionssignatur:
```diff
-export function createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks }) {
+export function createActivityRouter({ chatRegistry, dashboardRegistry, lockManager }) {
```

**Zeilen 40–61** — POST lock (gesamten Body ersetzen):
```diff
-  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
-    const { activityId, userId } = req;
-    const existing = activityLocks.get(String(activityId));
-    if (existing?.timerHandle) clearTimeout(existing.timerHandle);
-
-    const entry = {};
-    const durationMinutes = Math.min(120, Math.max(0, Number(req.body.durationMinutes) || 0));
-    if (durationMinutes > 0) {
-      entry.timerHandle = setTimeout(() => {
-        activityLocks.delete(String(activityId));
-        chatRegistry.broadcast(activityId, { type: 'unlocked' });
-        dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
-        console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${durationMinutes} min`);
-      }, durationMinutes * 60 * 1000);
-    }
-
-    activityLocks.set(String(activityId), entry);
-    chatRegistry.broadcast(activityId, { type: 'locked' });
-    dashboardRegistry.broadcast(activityId, { type: 'locked' });
-    console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
-    res.json({ ok: true, locked: true });
-  });
+  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
+    const { activityId, userId } = req;
+    const durationMinutes = Number(req.body.durationMinutes) || 0;
+    lockManager.lock(activityId, durationMinutes);
+    console.log(`[Lock] Aktivität ${activityId} gesperrt von ${userId}, Timer: ${durationMinutes} min`);
+    res.json({ ok: true, locked: true });
+  });
```

**Zeilen 63–72** — DELETE unlock (gesamten Body ersetzen):
```diff
-  router.delete('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
-    const { activityId, userId } = req;
-    const existing = activityLocks.get(String(activityId));
-    if (existing?.timerHandle) clearTimeout(existing.timerHandle);
-    activityLocks.delete(String(activityId));
-    chatRegistry.broadcast(activityId, { type: 'unlocked' });
-    dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
-    console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
-    res.json({ ok: true, locked: false });
-  });
+  router.delete('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
+    const { activityId, userId } = req;
+    lockManager.unlock(activityId);
+    console.log(`[Lock] Aktivität ${activityId} entsperrt von ${userId}`);
+    res.json({ ok: true, locked: false });
+  });
```

---

### 4. `chat-session.js` — `activityLocks` → `lockManager` (nicht im Plan erwähnt, aber notwendig)

`chat-session.js` destrukturiert `activityLocks` aus `this._deps` (Zeile 140) und ruft `.has()` direkt auf.
Da `server.js` ab jetzt `lockManager` statt `activityLocks` in die Deps einhängt, muss chat-session.js mitgezogen werden.

**Zeilen 140–142:**
```diff
-      const { chatRegistry, activityLocks } = this._deps;
+      const { chatRegistry, lockManager } = this._deps;
       chatRegistry.register(aid, this.ws);
-      if (activityLocks.has(aid)) this.ws.send(JSON.stringify({ type: 'locked' }));
+      if (lockManager.isLocked(aid)) this.ws.send(JSON.stringify({ type: 'locked' }));
```

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `lock-manager.js` | Neu anlegen |
| `server.js` | Import + 4 Stellen: `new Map()`, `createActivityRouter`, `activityLocks.has`, ChatSession-Deps |
| `routes/activity.js` | Signatur + Lock/Unlock-Body |
| `chat-session.js` | Destrukturierung + `.has()` → `.isLocked()` |

---

## Testen (durch Matthias)

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → „Sperren"-Button → Chat-Widget bei Schüler zeigt Sperr-Overlay
3. Dashboard zeigt Sperr-Badge
4. „Entsperren" → Widget entsperrt sich, Badge verschwindet
5. Sperren mit Timer (z.B. 1 min) → nach Ablauf automatische Entsperrung sichtbar

---

## Smoke-Test (Branch-Abschluss nach Schritt 05)

- Schüler-Chat (Widget öffnen, Nachricht senden, Antwort empfangen)
- Dashboard (Schüler-Liste, Chat-Verlauf, Kosten sichtbar)
- One-Click-Optimierung (vollständiger Durchlauf)
- Plenumsphase mit und ohne Timer

---

## Nach erfolgreichem Test

```bash
git add lock-manager.js server.js routes/activity.js chat-session.js
git commit -m "refactor: LockManager kapselt Aktivitätssperren aus server.js + activity-route"
git push
```
