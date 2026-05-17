# Schritt 11: server.js aufräumen

Alle verbleibenden toten Imports, lokalen Definitionen und temporären Überbrückungen
entfernen. Ergebnis: ~280 Zeilen reiner Orchestrator.

---

## Erwartete Struktur von server.js danach

```
server.js (~280 Zeilen)
├── Imports (Express, expressWs, http/https, cors, fs, child_process)
├── Imports (eigene Module: db, auth-middleware, chat-session, token-log,
│           config-cache, ai-instance, env-config, client-registry,
│           routes/*)
├── Process-Handler (unhandledRejection)
├── SSL-Setup (CERT/KEY-Erkennung, http/https-Server)
├── Rate-Limiting (limitRequests + pruning interval)
├── checkOrigin
├── dashboardRegistry, chatRegistry, activityLocks
├── checkFormat
├── Express-Middleware (cors, json, urlencoded, static)
├── Startup-Block (initDb, Admin-Seeding, cachedConfig-Init)
├── getEffectiveModel          ← bleibt, nur von streamResponse genutzt
├── buildInput                 ← bleibt, nur von streamResponse genutzt
├── streamResponse             ← bleibt (WebSocket-Kontext, Globals)
├── Route-Mounting (app.use('/api', ...))
├── app.ws('/api/dashboard-ws', ...)
├── app.ws('/api/chat', ...)
└── server.listen()
```

---

## Zu entfernende Definitionen (nach allen Schritten)

### Lokale Variablen / Konstanten

```js
// Entfernen — jetzt in env-config.js:
const MODEL_NAME       = ...
const AVAILABLE_MODELS = ...
const GEN_MODEL        = ...
const GEN_MODELS       = ...

// Entfernen — jetzt in config-cache.js:
let cachedConfig = ...

// Entfernen — jetzt in ai-instance.js:
const oai      = new OpenAI(...)
const aiClient = new AIClient(oai)
```

### Lokale Funktionen

```js
// Entfernen — jetzt in routes/validators.js:
const VALID_UPLOAD_MODES = ...
const VALID_BOT_ICONS    = ...
function validateTemplateFields(...) { ... }

// Entfernen — jetzt in routes/dashboard.js:
function enrichStudentsWithCost(...) { ... }

// Entfernen — jetzt in routes/simulation.js:
const ONE_CLICK_FALLBACK_NAMES = ...
function selectPersonasForOneClick(...) { ... }
```

### Guards die nach env-config.js / ai-instance.js wandern

```js
// Entfernen aus server.js (jetzt in ai-instance.js):
if (!process.env.APIKEY) { ... process.exit(1); }

// Entfernen aus server.js (jetzt in env-config.js):
if (!process.env.MODEL_NAME) { ... process.exit(1); }
```

### Übergangs-Imports (temporär während Migration)

```js
// War temporär für Zugriff während schrittweiser Migration:
import { validateTemplateFields } from './routes/validators.js';
// → entfernen wenn keine Route-Handler mehr in server.js
```

---

## Zu bereinigende Import-Zeile aus db.js

Der aktuelle Import ist 5 Zeilen lang (40+ Funktionen). Nach der Extraktion
braucht `server.js` nur noch was für WebSocket-Handler und Startup:

```js
// Nur noch diese DB-Funktionen in server.js:
import {
  initDb,
  getActiveSystemPrompt, saveSystemPrompt,   // Startup-Block
  addAdmin,                                   // Admin-Seeding
  getStudents, getActivity,                   // Dashboard-WS-Handler
  getMessages,                                // Dashboard-WS-Handler
  getMessagesAll,                             // streamResponse (buildInput)
  getActiveErfahrungsprompt,                  // streamResponse
} from './db.js';
```

---

## Finale Import-Struktur server.js

```js
import express from 'express';
import expressWs from 'express-ws';
import http from 'http';
import https from 'https';
import cors from 'cors';
import fs from 'fs';

import { initDb, getActiveSystemPrompt, saveSystemPrompt, addAdmin,
         getStudents, getActivity, getMessages, getMessagesAll,
         getActiveErfahrungsprompt } from './db.js';
import { ChatSession } from './chat-session.js';
import { buildInstructions } from './prompt-builder.js';
import { recordUsage, enrichMessagesWithCost, computeThreadCost,
         computeActivityCost, computeRunCost } from './token-log.js';
import { isOriginAllowed, generateDashboardToken, validateDashboardToken,
         getUserNameFromToken, requireTeacherAuth, requireDashboardAuth,
         requireAdminAuth } from './auth-middleware.js';
import { ClientRegistry } from './client-registry.js';

import { getCachedConfig, updateCachedConfig } from './config-cache.js';
import { oai, aiClient } from './ai-instance.js';
import { MODEL_NAME, AVAILABLE_MODELS, GEN_MODEL, GEN_MODELS } from './env-config.js';

import { createActivityRouter } from './routes/activity.js';
import dashboardRouter, { enrichStudentsWithCost } from './routes/dashboard.js';
import { createAdminRouter } from './routes/admin.js';
import teacherRouter from './routes/teacher.js';
import erfahrungspromptRouter from './routes/erfahrungsprompt.js';
import personasRouter from './routes/personas.js';
import criteriaRouter from './routes/criteria.js';
import simulationRouter from './routes/simulation.js';
```

---

## Route-Mounting Block

```js
const activityRouter = createActivityRouter({ chatRegistry, dashboardRegistry, activityLocks });
const adminRouter    = createAdminRouter({ dashboardRegistry });

app.use('/api', activityRouter);
app.use('/api', dashboardRouter);
app.use('/api', adminRouter);
app.use('/api', teacherRouter);
app.use('/api', erfahrungspromptRouter);
app.use('/api', personasRouter);
app.use('/api', criteriaRouter);
app.use('/api', simulationRouter);
```

---

## Finaler Smoke-Test

```bash
systemctl restart moo-gpt
journalctl -u moo-gpt -n 20 --no-pager
# Alle Startup-Logs erscheinen normal

# Vollständiger Funktionstest:
# 1. Chat-Widget öffnen, Nachricht senden → Antwort kommt
# 2. Dashboard öffnen → Schülerliste sichtbar
# 3. Aktivität sperren → Widget zeigt Sperre
# 4. Admin-Config lesen → GET /api/admin/config
# 5. Simulation starten → SSE-Stream läuft durch
```

---

## Ergebnis

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| server.js Zeilen | 1.129 | ~280 |
| HTTP-Handler in server.js | 32 | 0 |
| Neue Dateien | — | 11 |
| Gesamt-Zeilen Projekt (JS) | ~2.500 | ~2.600 |

Die Gesamtzeilen steigen leicht durch Imports und Boilerplate — der Gewinn liegt
in der Lokalität: jede Domäne ist in sich geschlossen und navigierbar.
