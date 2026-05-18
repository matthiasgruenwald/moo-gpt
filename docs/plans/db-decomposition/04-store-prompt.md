# Schritt 04: stores/prompt.js

System-Prompt und Erfahrungsprompt teilen sich die `prompts`-Tabelle (unterschieden
durch `scope` und `type`). Beide Konzepte gehören in einen Store.

---

## Zu extrahierende Funktionen

```js
// System-Prompt (scope='global', type='system')
export function getActiveSystemPrompt() { ... }
export function saveSystemPrompt(content, model, createdBy) { ... }
export function getPromptHistory() { ... }
export function deletePromptHistoryEntry(id) { ... }

// Erfahrungsprompt (scope=activityId, type='erfahrung')
export function getActiveErfahrungsprompt(activityId) { ... }
export function saveErfahrungsprompt(activityId, content, createdBy) { ... }
export function getErfahrungspromptHistory(activityId) { ... }
export function deleteErfahrungspromptHistoryEntry(activityId, id) { ... }
```

---

## Neue Datei: stores/prompt.js

```js
import { getDb } from '../db.js';

export function getActiveSystemPrompt() {
  return getDb().prepare(`
    SELECT content, model, version, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 1
  `).get() || null;
}

export function saveSystemPrompt(content, model, createdBy) {
  const last = getDb().prepare(
    `SELECT version FROM prompts WHERE scope = 'global' AND type = 'system' ORDER BY id DESC LIMIT 1`
  ).get();
  const version = last ? last.version + 1 : 1;
  getDb().prepare(`
    INSERT INTO prompts (scope, type, model, content, version, created_by)
    VALUES ('global', 'system', ?, ?, ?, ?)
  `).run(model, content, version, createdBy || null);
}

export function getPromptHistory() {
  return getDb().prepare(`
    SELECT id, version, model, content, created_by, created_at
    FROM prompts WHERE scope = 'global' AND type = 'system'
    ORDER BY id DESC LIMIT 20
  `).all();
}

export function deletePromptHistoryEntry(id) {
  const latest = getDb().prepare(
    `SELECT id FROM prompts WHERE scope = 'global' AND type = 'system' ORDER BY id DESC LIMIT 1`
  ).get();
  if (!latest || latest.id === id) return { ok: false, error: 'Aktuelle Version kann nicht gelöscht werden' };
  getDb().prepare(`DELETE FROM prompts WHERE id = ? AND scope = 'global' AND type = 'system'`).run(id);
  return { ok: true };
}

export function getActiveErfahrungsprompt(activityId) {
  if (!activityId) return null;
  return getDb().prepare(`
    SELECT content, version, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 1
  `).get(activityId) || null;
}

export function saveErfahrungsprompt(activityId, content, createdBy) {
  const last = getDb().prepare(
    `SELECT version FROM prompts WHERE scope = ? AND type = 'erfahrung' ORDER BY id DESC LIMIT 1`
  ).get(activityId);
  const version = last ? last.version + 1 : 1;
  getDb().prepare(`
    INSERT INTO prompts (scope, type, content, version, created_by)
    VALUES (?, 'erfahrung', ?, ?, ?)
  `).run(activityId, content, version, createdBy || null);
}

export function getErfahrungspromptHistory(activityId) {
  if (!activityId) return [];
  return getDb().prepare(`
    SELECT id, version, content, created_by, created_at
    FROM prompts WHERE scope = ? AND type = 'erfahrung'
    ORDER BY id DESC LIMIT 10
  `).all(activityId);
}

export function deleteErfahrungspromptHistoryEntry(activityId, id) {
  const latest = getDb().prepare(
    `SELECT id FROM prompts WHERE scope = ? AND type = 'erfahrung' ORDER BY id DESC LIMIT 1`
  ).get(activityId);
  if (!latest || latest.id === id) return { ok: false, error: 'Aktuelle Version kann nicht gelöscht werden' };
  getDb().prepare(`DELETE FROM prompts WHERE id = ? AND scope = ? AND type = 'erfahrung'`).run(id, activityId);
  return { ok: true };
}
```

---

## Änderungen in db.js

Alle 8 Prompt-Funktionen aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import (Store) | Verbleibt in db.js |
|-------|---------------------|-------------------|
| `routes/admin.js` | `import { saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry } from '../stores/prompt.js';` | — (admin.js-Import komplett aus db.js raus) |
| `routes/erfahrungsprompt.js` | `import { getActiveErfahrungsprompt, saveErfahrungsprompt, getErfahrungspromptHistory, deleteErfahrungspromptHistoryEntry } from '../stores/prompt.js';` | — |
| `routes/activity.js` | `import { getActiveErfahrungsprompt } from '../stores/prompt.js';` | `getTeacherPreference` bleibt in db.js |
| `routes/simulation.js` | `import { getActiveErfahrungsprompt } from '../stores/prompt.js';` | `getAllPersonasForUser, getGlobalPersonas, getTeacherPersonas, getCriteria, saveErkenntnisse` bleiben in db.js |
| `server.js` | `import { getActiveSystemPrompt, saveSystemPrompt, getActiveErfahrungsprompt } from './stores/prompt.js';` | `initDb, getStudents, getMessages, getMessagesAll, getTeacherPreference, saveMessage` bleiben in db.js |
| `criteria.js` | `import { getActiveErfahrungsprompt } from './stores/prompt.js';` | — |
| `optimize.js` | `import { getActiveErfahrungsprompt } from './stores/prompt.js';` | `getFeedbackByActivity, getErkenntnisse` bleiben in db.js |
| `chat-session.js` | `import { getActiveErfahrungsprompt, saveErfahrungsprompt } from './stores/prompt.js';` | `getTeacherDefaultTemplate, getSystemTemplate, findThread, touchThread, updateThreadName, saveThread, saveMessage, getMessages` bleiben in db.js |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → Logs zeigen `[Config] Systemprompt aus DB (v…)`
2. GET /api/admin/config → Prompt und Modell korrekt zurückgegeben
3. Erfahrungsprompt im Dashboard öffnen → speichern → History zeigt neue Version
4. Im Prompt-History-Panel: ältesten Eintrag löschen → verschwindet aus Liste; neuesten Eintrag löschen versuchen → Fehlermeldung (kein Löschen möglich)
