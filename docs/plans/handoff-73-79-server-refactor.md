# Handoff: server.js Refactoring — Issues #73–#79

**Für:** Neue Overseer-Session (AFK, vollständig eigenständig)  
**Erstellt:** 2026-05-25  
**Repo:** `matthiasgruenwald/moo-gpt`, Branch `main`  
**Arbeitsverzeichnis:** `/opt/moo-gpt`

---

## Ziel

`server.js` von ~445 Zeilen auf ~100 Zeilen reine Infrastruktur reduzieren. Geschäftslogik in dedizierte Module extrahieren. Sieben GitHub-Issues in vier Wellen umsetzen — vollständig automatisiert, ohne menschliche Interaktion.

## Autorisierungsstand

`/opt/moo-gpt/.claude/settings.json` enthält `allowedTools` für alle benötigten Operationen (Edit, Write, git, gh, node tests). Keine interaktiven Prompts erwartet.

> **Falls doch ein Prompt erscheint:** Es handelt sich um einen Befehl außerhalb der allowedTools-Liste. Einmalig genehmigen und danach `allowedTools` in `.claude/settings.json` ergänzen.

---

## Wellen-Übersicht

```
Welle 1 (parallel):  #73  #74  #75
                       ↓    ↓    ↓
                     merge merge merge
                          ↓
Welle 2 (einzeln):       #76
                           ↓
                         merge
                           ↓
Welle 3 (einzeln):        #77   ← inkl. checkOrigin-Migration
                           ↓
                         merge
                           ↓
Welle 4 (parallel):    #78  #79
                         ↓    ↓
                       merge merge
```

---

## Arbeitsweise für jeden Issue

Jeder Worker-Agent bekommt folgenden Ablauf:

1. **Karpathy-Guidelines laden:** `/karpathy-guidelines` aktivieren, bevor Code angefasst wird
2. **Issue lesen:** `gh issue view <N> --repo matthiasgruenwald/moo-gpt`
3. **Feature-Branch anlegen:** `git checkout -b refactor/issue-<N>-<kurzname>`
4. **TDD-Zyklus:** `/tdd` — erst Tests schreiben (rot), dann Extraktion (grün), dann ggf. refactorn
5. **Verifikation:** Tests laufen lassen; manuell prüfen, dass kein Behavior-Change vorliegt
6. **Commit:** `git add -p` + `git commit -m "refactor(#<N>): <titel>"`
7. **PR erstellen:** `gh pr create --repo matthiasgruenwald/moo-gpt --base main --title "refactor(#<N>): <titel>" --body "Closes #<N>"`
8. **Issue schließen:** PR-Merge schließt Issue automatisch via "Closes #N"

---

## Welle 1 — Parallel starten, kein Blocker

### Agent 1 — Issue #73: `message-formatter.js`

**Branch:** `refactor/issue-73-message-formatter`

**Aufgabe:**  
`buildInput()` aus `server.js` (Zeilen ~341–366) in neues Modul `message-formatter.js` extrahieren.

Die Funktion konvertiert DB-Nachrichten (mit `content_type`-Feld) in das OpenAI Responses API Input-Array:
- `image`/`task_image` + Base64 → `{ type: 'input_image', image_url: ... }`
- `image`/`task_image` + File-Marker `[image:file-xxx]` → `{ type: 'input_image', file_id: ... }`
- `pdf` + File-Marker `[pdf:file-xxx]` → `{ type: 'input_file', file_id: ... }`
- Default → `{ role, content }` Plaintext

**Tests (TDD, vor Extraktion):**
- image Base64 → input_image mit image_url
- image File-ID-Marker → input_image mit file_id
- pdf File-ID-Marker → input_file mit file_id
- Plaintext → pass-through

**Exports:** `export function buildInput(messages)`  
**server.js nach Extraktion:** `import { buildInput } from './message-formatter.js'`  
**Acceptance:** Alle Tests grün, `server.js` hat keine lokale `buildInput`-Definition mehr.

---

### Agent 2 — Issue #74: `model-resolver.js`

**Branch:** `refactor/issue-74-model-resolver`

**Aufgabe:**  
`getEffectiveModel()` aus `server.js` (Zeilen ~202–210) in neues Modul `model-resolver.js` extrahieren.

Prioritäts-Kaskade:
1. `isTeacher && userId` → `getTeacherPreference(userId).preferred_model` (wenn in `AVAILABLE_MODELS`)
2. `getCachedConfig().model`
3. `MODEL_NAME` aus `env-config.js`

**Tests (TDD, vor Extraktion):**
- Lehrer mit gültiger Präferenz → Präferenz zurückgeben
- Lehrer mit Präferenz außerhalb `AVAILABLE_MODELS` → Fallback auf Config-Cache
- Lehrer ohne Präferenz → Config-Cache
- Config-Cache leer → `MODEL_NAME`
- `isTeacher = false` → direkt Config-Cache

**Exports:** `export function getEffectiveModel(isTeacher, userId)`  
**server.js nach Extraktion:** `import { getEffectiveModel } from './model-resolver.js'`  
**Acceptance:** Alle Tests grün, `server.js` hat keine lokale `getEffectiveModel`-Definition mehr.

---

### Agent 3 — Issue #75: `routes/dashboard-ws.js`

**Branch:** `refactor/issue-75-dashboard-ws`

**Aufgabe:**  
`app.ws('/api/dashboard-ws', ...)` Handler aus `server.js` (Zeilen ~225–303, ~78 Zeilen) in `routes/dashboard-ws.js` auslagern.

DI-Factory-Pattern wie andere Routes:
```js
export function createDashboardWsRouter({ dashboardRegistry, lockManager }) {
  const router = express.Router();
  // express-ws macht app.ws() auf einem Router über expressWs(router)
  // oder: router.ws('/api/dashboard-ws', ...)
  return router;
}
```

> **Hinweis zu express-ws und Routern:** `express-ws` patcht `app.ws()`, aber `router.ws()` funktioniert nur wenn der Router selbst auch durch `expressWs` gepatcht wird. Prüfe, ob `expressWs(router)` nötig ist — oder exportiere stattdessen eine Funktion `registerDashboardWs(app, deps)`, die direkt auf `app` aufruft. Wähle, was sauberer kompiliert.

**Handler-Logik:**
- Origin-Prüfung via `isOriginAllowed(req)`
- Token + activityId validieren via `validateDashboardToken`
- Teacher-Attribution: `setTeacherIfUnset(activityId, teacherId, teacherName)`
- `dashboardRegistry.register(activityId, ws)`
- Async IIFE: initiale Schülerliste + `activityCost` + Lock-Status senden
- `ws.on('message')`: `getMessages`-Request → `enrichMessagesWithCost` + `computeThreadCost` senden
- `ws.on('close')`: `dashboardRegistry.unregister(activityId, ws)`

**Tests:** Verbindungsaufbau mit gültigem/ungültigem Token, initiale Daten-Sendung, getMessages-Response, Disconnect-Cleanup.

**Acceptance:** `server.js` hat keinen inline `app.ws('/api/dashboard-ws', ...)` Block mehr, alle Dashboard-WS-Features funktionieren.

---

## Nach Welle 1: Merge-Sequenz

Wenn alle drei PRs (#73, #74, #75) erstellt sind:

```bash
# Alle drei mergen (squash für saubere History)
gh pr merge <PR-Nr-73> --repo matthiasgruenwald/moo-gpt --squash --auto
gh pr merge <PR-Nr-74> --repo matthiasgruenwald/moo-gpt --squash --auto
gh pr merge <PR-Nr-75> --repo matthiasgruenwald/moo-gpt --squash --auto
```

PR-Nummern ermitteln:
```bash
gh pr list --repo matthiasgruenwald/moo-gpt --state open
```

Warten bis alle gemergt:
```bash
# Wiederholen bis leer
gh pr list --repo matthiasgruenwald/moo-gpt --state open --json number,title
```

---

## Welle 2 — Blocked by #73 + #74

### Agent 4 — Issue #76: `services/chat-response.js`

**Branch:** `refactor/issue-76-chat-response`

**Voraussetzung:** `git pull origin main` (holt #73 + #74 rein)

**Aufgabe:**  
`streamResponse()` aus `server.js` (Zeilen ~372–441) in `services/chat-response.js` als DI-Factory extrahieren.

```js
// services/chat-response.js
import { buildInput } from '../message-formatter.js';       // aus #73
import { getEffectiveModel } from '../model-resolver.js';  // aus #74
import { buildInstructions } from '../prompt-builder.js';
import { getStudentMemory } from '../stores/student-memory.js';
import { getCachedConfig } from '../config-cache.js';
import { getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getMessagesAll, saveMessage } from '../stores/chat.js';
import { recordUsage } from '../token-log.js';

export function createStreamResponse({ dashboardRegistry, aiClient }) {
  return async function streamResponse(ws, settings, threadDbId) {
    // ... identische Logik wie aktuell in server.js
  };
}
```

**server.js Änderung:**
```js
import { createStreamResponse } from './services/chat-response.js';
// nach Registry-Init:
const streamResponse = createStreamResponse({ dashboardRegistry, aiClient });
// ChatSession erhält es unverändert via DI — kein Umbau an chat-session.js
```

**Tests (mit gemockten Dependencies):**
- Erfolgreicher Stream: Chunks werden an ws.send() geschickt, Abschluss-Frame `{ end: true }` am Ende
- Fehlerfall: AI-Fehler → ws.send mit `{ end: true, messages: 'Error: ...' }`, kein Crash
- Dashboard-Broadcast bei gesetzter `activityId`: `dashboardRegistry.broadcast()` aufgerufen
- Kein Broadcast ohne `activityId`
- `saveMessage()` wird nach Stream-Ende aufgerufen
- `recordUsage()` wird mit korrekten Parametern aufgerufen

**Acceptance:** `server.js` hat keine lokale `streamResponse`-Definition mehr, ChatSession unverändert.

---

## Nach Welle 2: Merge

```bash
gh pr merge <PR-Nr-76> --repo matthiasgruenwald/moo-gpt --squash --auto
```

---

## Welle 3 — Blocked by #73, #74, #75, #76

### Agent 5 — Issue #77: `server.js` bereinigen

**Branch:** `refactor/issue-77-server-cleanup`

**Voraussetzung:** `git pull origin main` (holt alle Welle-1+2-Änderungen rein)

**Aufgabe:**  
server.js auf ~100 Zeilen reine Infrastruktur reduzieren.

**Schritte:**
1. Alle toten Imports entfernen (was jetzt aus den neuen Modulen kommt)
2. Sicherstellen dass alle Importe aus den neuen Modulen gesetzt sind
3. `checkOrigin()` (Zeilen ~122–142) in `auth-middleware.js` integrieren:
   - `auth-middleware.js` bekommt: `export function checkOriginWs(ws, req, next) { ... }`
   - Logik: identisch zur aktuellen Inline-Funktion — prüft `ALLOWED_ORIGIN` env, ruft `next()` oder sendet Fehler + schließt WS
   - `server.js` importiert `checkOriginWs` aus `auth-middleware.js`
4. Verbleibende Inhalte prüfen: nur Infrastruktur darf bleiben

**Was nach der Bereinigung in server.js steht:**
```
- Imports (server setup + registries + routes + auth)
- HTTPS/HTTP Server-Erstellung
- Rate-Limiter-Aufruf (limitRequests — noch lokal, wird in #78 extrahiert)
- express Middleware (cors, json, static)
- app-init Inline-Block (DB-Init etc. — wird in #79 extrahiert)
- Router-Registrierungen (app.use())
- app.ws('/api/dashboard-ws') → createDashboardWsRouter (aus #75)
- app.ws('/api/chat') → ChatSession-Wrapper (bleibt hier, ist dünn)
- server.listen()
```

**Tests:** Smoke-Test — alle Routen antworten korrekt. Kann mit einem einfachen `node --test` Integrations-Test verifiziert werden oder durch manuelles Prüfen der Route-Liste.

**Acceptance:** server.js ≤120 Zeilen, keine toten Imports, alle Routes erreichbar.

---

## Nach Welle 3: Merge

```bash
gh pr merge <PR-Nr-77> --repo matthiasgruenwald/moo-gpt --squash --auto
```

---

## Welle 4 — Blocked by #77, parallel startbar

### Agent 6 — Issue #78: `rate-limiter.js`

**Branch:** `refactor/issue-78-rate-limiter`

**Voraussetzung:** `git pull origin main`

**Aufgabe:**  
`limitRequests()` + `requests`-Map + `setInterval`-Cleanup aus `server.js` in `rate-limiter.js` extrahieren.

```js
export function createRateLimiter() {
  const requests = {};
  setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    for (const ip of Object.keys(requests)) {
      if (requests[ip].date !== today) delete requests[ip];
    }
  }, 24 * 60 * 60 * 1000);

  return function limitRequests(ws, req, message, next) { ... };
}
```

**server.js:** `const limitRequests = createRateLimiter()` nach App-Init.

**Tests:** Limit einhalten → `next()` aufgerufen; Limit überschritten → WS-Fehler + close; Datum-Wechsel → Counter reset; IP-Isolation (zwei IPs zählen unabhängig).

---

### Agent 7 — Issue #79: `app-init.js`

**Branch:** `refactor/issue-79-app-init`

**Voraussetzung:** `git pull origin main`

**Aufgabe:**  
DB-Init + Admin-Seed + Config-Load aus `server.js` (Zeilen ~160–183) in `app-init.js` extrahieren.

```js
export function initApp() {
  initDb();
  // Admin-Seed aus ADMIN_USER_IDS
  // System-Prompt aus DB laden oder aus ENV migrieren
}
```

**server.js:** `initApp()` aufrufen vor Router-Registrierung.

**Tests:** Erststart mit leerer DB (Env-Prompt wird migriert), Wiederkehr-Start (DB-Prompt geladen), Admin-Seed idempotent (kein Doppeleintrag bei zweitem Aufruf).

---

## Nach Welle 4: Merge beide PRs

```bash
gh pr merge <PR-Nr-78> --repo matthiasgruenwald/moo-gpt --squash --auto
gh pr merge <PR-Nr-79> --repo matthiasgruenwald/moo-gpt --squash --auto
```

---

## Commit-Konventionen

```
refactor(#73): buildInput() → message-formatter.js
refactor(#74): getEffectiveModel() → model-resolver.js
refactor(#75): Dashboard-WS-Handler → routes/dashboard-ws.js
refactor(#76): streamResponse() → services/chat-response.js
refactor(#77): server.js bereinigen (~100 Zeilen Infrastruktur)
refactor(#78): limitRequests() → rate-limiter.js
refactor(#79): App-Initialisierung → app-init.js
```

---

## Kein Deploy nötig

Diese Session erstellt nur PRs und mergt sie. Kein `systemctl restart` — das macht Matthias nach dem Review in seiner eigenen Session.

---

## Abschluss-Checks

Nach allen Merges:
```bash
gh issue list --repo matthiasgruenwald/moo-gpt --state open | grep -E "#7[3-9]"
# sollte leer sein (alle Issues geschlossen durch PR-Merge)

wc -l /opt/moo-gpt/server.js
# sollte ≤120 sein
```
