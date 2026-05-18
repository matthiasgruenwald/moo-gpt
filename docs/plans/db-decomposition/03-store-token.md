# Schritt 03: stores/token.js

Token-Rohdaten-Schicht: Speichern und Aggregieren von token_log-Einträgen.
Wird von token-log.js genutzt (Berechnung bleibt dort, Datenhaltung kommt hierher).

---

## Zu extrahierende Funktionen

```js
// Aus db.js → stores/token.js
export function saveTokenUsage(threadId, activityId, model, usage, messageId) { ... }
export function getThreadCostTokens(threadDbId) { ... }
export function getActivityCostTokens(activityId) { ... }
```

---

## Neue Datei: stores/token.js

```js
import { getDb } from '../db.js';

export function saveTokenUsage(threadId, activityId, model, usage, messageId = null) {
  if (!usage) return;
  getDb().prepare(`
    INSERT INTO token_log (thread_id, activity_id, model, prompt_tokens, completion_tokens, total_tokens, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    threadId   || null,
    activityId || null,
    model      || null,
    usage.prompt_tokens      ?? null,
    usage.completion_tokens  ?? null,
    usage.total_tokens       ?? null,
    messageId  || null
  );
}

export function getThreadCostTokens(threadDbId) {
  return getDb().prepare(`
    SELECT COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE thread_id = ?
  `).get(threadDbId) || { prompt_tokens: 0, completion_tokens: 0 };
}

export function getActivityCostTokens(activityId) {
  return getDb().prepare(`
    SELECT COALESCE(SUM(prompt_tokens), 0)     AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM token_log WHERE activity_id = ?
  `).get(activityId) || { prompt_tokens: 0, completion_tokens: 0 };
}
```

---

## Änderungen in db.js

Funktionen `saveTokenUsage`, `getThreadCostTokens`, `getActivityCostTokens` aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `token-log.js` | `import { saveTokenUsage, getThreadCostTokens, getActivityCostTokens } from './stores/token.js';` |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Chat-Nachricht senden und Antwort abwarten
3. Dashboard öffnen → Token-Kosten für den Thread erscheinen im Footer
