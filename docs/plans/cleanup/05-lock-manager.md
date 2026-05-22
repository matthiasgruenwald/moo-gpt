# Schritt 05: LockManager

**Problem:** Aktivitätssperren (Plenumsphase) sind als rohes `new Map()` in `server.js` implementiert. `routes/activity.js` manipuliert die Map direkt und ist selbst für Timer-Verwaltung und Registry-Broadcasts zuständig. Sperr-Semantik ist auf zwei Dateien verteilt.

**Lösung:** Neue Klasse `lock-manager.js` kapselt Zustand, Timer und Broadcasts. Die Route ruft nur noch `lockManager.lock()` / `lockManager.unlock()`.

---

## Neue Datei: `lock-manager.js`

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

## Änderungen in `server.js`

```diff
+import { LockManager } from './lock-manager.js';

-const activityLocks = new Map();
+const lockManager = new LockManager(chatRegistry, dashboardRegistry);

-const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks });
+const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, lockManager });

 // WebSocket-Handler (Zeile ~245): Initialzustand an neuen Dashboard-Client senden
-locked: activityLocks.has(activityId),
+locked: lockManager.isLocked(activityId),
```

---

## Änderungen in `routes/activity.js`

```diff
-export function createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks }) {
+export function createActivityRouter({ chatRegistry, dashboardRegistry, lockManager }) {

 // POST /activity/:activityId/lock
-  router.post('/activity/:activityId/lock', requireDashboardAuth, (req, res) => {
-    const { activityId, userId } = req;
-    const existing = activityLocks.get(String(activityId));
-    if (existing?.timerHandle) clearTimeout(existing.timerHandle);
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

 // DELETE /activity/:activityId/lock
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

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `lock-manager.js` | Neu anlegen |
| `server.js` | Import, `new Map()` ersetzen, `isLocked`-Aufruf |
| `routes/activity.js` | Dependency-Name, Lock/Unlock-Logik durch LockManager-Aufrufe ersetzen |

---

## Testen

1. `systemctl restart moo-gpt` → kein Importfehler
2. Dashboard → „Sperren"-Button → Chat-Widget bei Schüler zeigt Sperr-Overlay
3. Dashboard zeigt Sperr-Badge
4. „Entsperren" → Widget entsperrt sich, Badge verschwindet
5. Sperren mit Timer (z.B. 1 min) → nach Ablauf automatische Entsperrung in Dashboard und Widget sichtbar
6. Vollständiger Smoke-Test: Chat senden, Dashboard live, Simulation starten — alles funktioniert

---

## Smoke-Test (Branch-Abschluss)

Nach Schritt 05 vollständiger Funktionstest:
- Schüler-Chat (Widget öffnen, Nachricht senden, Antwort empfangen)
- Dashboard (Schüler-Liste, Chat-Verlauf öffnen, Kosten sichtbar)
- One-Click-Optimierung (vollständiger Durchlauf)
- Plenumsphase mit und ohne Timer
