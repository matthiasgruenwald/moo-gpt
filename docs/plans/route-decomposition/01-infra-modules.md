# Schritt 1: Infrastruktur-Module erstellen

Drei neue Module für geteilten State und Umgebungs-Konstanten.
Kein Verhalten ändert sich — nur Umzug aus `server.js`.

---

## 1a — `config-cache.js`

### Zweck
Hält den mutablen AI-Config-State (System-Prompt + aktives Modell) als Modul-Singleton.
Wird schreibend von `routes/admin.js`, lesend von allen Modulen genutzt die den Prompt brauchen.

### Problem das gelöst wird
`cachedConfig` war eine `let`-Variable in `server.js`. Route-Module könnten sie nicht
lesen ohne sie übergeben zu bekommen. Mit einem eigenen Modul importiert jeder direkt.

### Exports

```js
export function getCachedConfig()                    // → { content, model }
export function updateCachedConfig(content, model)   // → void
```

### Vollständige Implementierung

```js
let _config = { content: '', model: '' };

export const getCachedConfig = () => _config;

export function updateCachedConfig(content, model) {
  _config = { content, model };
}
```

### Änderungen in server.js

**Entfernen:**
```js
let cachedConfig = { content: SYSTEM_PROMPT, model: MODEL_NAME };
```

**Ersetzen durch:**
```js
import { getCachedConfig, updateCachedConfig } from './config-cache.js';
```

**Startup-Block anpassen** (nach `initDb()`):
```js
// Vorher:
cachedConfig = { content: dbPrompt.content, model: dbPrompt.model || MODEL_NAME };
// Nachher:
updateCachedConfig(dbPrompt.content, dbPrompt.model || MODEL_NAME);
```

**Fallback-Init** (Env-Migration):
```js
// Vorher:
cachedConfig = { content: SYSTEM_PROMPT || '', model: MODEL_NAME };
// Nachher:
updateCachedConfig(SYSTEM_PROMPT || '', MODEL_NAME);
```

**PUT /api/admin/config** (bleibt noch in server.js bis Schritt 5):
```js
// Vorher:
cachedConfig = { content: systemPrompt, model };
// Nachher:
updateCachedConfig(systemPrompt, model);
```

**Alle Lesezugriffe** (in server.js):
```js
// Vorher:
cachedConfig.content
cachedConfig.model
// Nachher:
getCachedConfig().content
getCachedConfig().model
```

### Gotcha: Modul-Singleton in Tests
In Test-Suites teilen sich alle Imports denselben State. Falls Tests geschrieben werden:
`updateCachedConfig('', '')` als Reset in `beforeEach` aufrufen.

---

## 1b — `ai-instance.js`

### Zweck
Erstellt die `OpenAI`- und `AIClient`-Instanzen einmalig. Exportiert beide.
`oai` wird von `chat-session.js` für Datei-Uploads gebraucht, `aiClient` von Route-Modulen.

### Exports

```js
export const oai       // OpenAI-Instanz
export const aiClient  // AIClient-Instanz
```

### Vollständige Implementierung

```js
import OpenAI from 'openai';
import { AIClient } from './ai-client.js';

if (!process.env.APIKEY) {
  console.error('APIKEY ist nicht gesetzt');
  process.exit(1);
}

export const oai      = new OpenAI({ apiKey: process.env.APIKEY });
export const aiClient = new AIClient(oai);
```

### Änderungen in server.js

**Entfernen:**
```js
if (!process.env.APIKEY) {
  console.error("APIKEY ist nicht gesetzt");
  process.exit(1);
}
const oai = new OpenAI({ apiKey: process.env.APIKEY });
const aiClient = new AIClient(oai);
```

**Ersetzen durch:**
```js
import { oai, aiClient } from './ai-instance.js';
```

`oai` und `aiClient` werden im WebSocket-Handler an `ChatSession` übergeben —
das bleibt identisch, nur die Herkunft ändert sich.

---

## 1c — `env-config.js`

### Zweck
Berechnet alle Env-abhängigen Konstanten einmalig. Wird von 5 Route-Modulen genutzt.
Vermeidet Duplizierung der Split/Trim-Logik in jedem Router.

### Exports

```js
export const MODEL_NAME        // string
export const AVAILABLE_MODELS  // string[]
export const GEN_MODEL         // string
export const GEN_MODELS        // string[]
```

### Vollständige Implementierung

```js
export const MODEL_NAME = process.env.MODEL_NAME;

if (!MODEL_NAME) {
  console.error('MODEL_NAME ist nicht gesetzt (z.B. gpt-5)');
  process.exit(1);
}

export const AVAILABLE_MODELS = process.env.AVAILABLE_MODELS
  ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
  : [MODEL_NAME];

export const GEN_MODEL  = process.env.GEN_MODEL || 'gpt-4.1-nano';
export const GEN_MODELS = [...new Set(['gpt-4.1-nano', 'gpt-4.1', ...AVAILABLE_MODELS])];
```

### Änderungen in server.js

**Entfernen:**
```js
if (!process.env.MODEL_NAME) { ... process.exit(1); }
const MODEL_NAME    = process.env.MODEL_NAME;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';
const AVAILABLE_MODELS = ...
const GEN_MODEL  = ...
const GEN_MODELS = ...
```

**Ersetzen durch:**
```js
import { MODEL_NAME, AVAILABLE_MODELS, GEN_MODEL, GEN_MODELS } from './env-config.js';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '';
```

`SYSTEM_PROMPT` bleibt in `server.js` weil es nur im Startup-Block gebraucht wird
(ENV-Migration in DB).

---

## Reihenfolge der Änderungen

1. `config-cache.js` erstellen
2. `ai-instance.js` erstellen
3. `env-config.js` erstellen
4. In `server.js` importieren und lokale Definitionen ersetzen
5. Server neu starten — kein Verhaltenswechsel erwartet

## Smoke-Test

```bash
systemctl restart moo-gpt
journalctl -u moo-gpt -n 10 --no-pager
# Erwartung: Startup-Logs identisch mit vorher (DB-Version, Modell, Port)
```
