# Schritt 09: stores/chat.js + stores/dashboard.js

Größte Domäne. Threads und Nachrichten – das Herzstück der Chat-Persistenz.
Zuletzt extrahiert, weil am meisten genutzt und am kritischsten für den laufenden Betrieb.

`stores/dashboard.js` wird im selben Schritt angelegt (vertical slice: `routes/dashboard.js`
wird ohnehin angefasst).

---

## Zu extrahierende Funktionen

### stores/chat.js (7 Funktionen)

```js
// Threads
export function saveThread({ moodle_user_id, moodle_user_name, activity_id, openai_thread_id }) { ... }
export function touchThread(thread_db_id) { ... }
export function findThread({ moodle_user_id, activity_id }) { ... }
export function updateThreadName(thread_db_id, moodle_user_name) { ... }

// Nachrichten
export function saveMessage({ thread_db_id, role, content, content_type }) { ... }
export function getMessages(thread_db_id) { ... }       // gefiltert (ohne task_image)
export function getMessagesAll(thread_db_id) { ... }    // vollständig (inkl. task_image)
```

**Hinweis:** `saveMessage` ruft intern `touchThread` auf. Beide müssen im selben
Modul bleiben — das ist hier der Fall.

### stores/dashboard.js (1 Funktion)

```js
// Cross-domain-Aggregation für Dashboard-Ansicht (threads + messages + token_log)
export function getStudents(activity_id) { ... }
```

---

## Neue Datei: stores/chat.js

```js
import { getDb } from '../db.js';

export function saveThread({ moodle_user_id, moodle_user_name, activity_id, openai_thread_id = null }) {
  const result = getDb().prepare(`
    INSERT INTO threads (moodle_user_id, moodle_user_name, activity_id, openai_thread_id)
    VALUES (?, ?, ?, ?)
  `).run(moodle_user_id || null, moodle_user_name || null, activity_id || null, openai_thread_id || null);
  return result.lastInsertRowid;
}

export function touchThread(thread_db_id) {
  getDb().prepare('UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(thread_db_id);
}

export function findThread({ moodle_user_id, activity_id }) {
  if (!moodle_user_id || !activity_id) return null;
  return getDb().prepare(`
    SELECT * FROM threads
    WHERE moodle_user_id = ? AND activity_id = ?
    ORDER BY updated_at DESC LIMIT 1
  `).get(moodle_user_id, activity_id) || null;
}

export function updateThreadName(thread_db_id, moodle_user_name) {
  if (!thread_db_id || !moodle_user_name) return;
  getDb().prepare(`
    UPDATE threads
    SET moodle_user_name = ?
    WHERE id = ? AND (moodle_user_name IS NULL OR moodle_user_name = '')
  `).run(moodle_user_name, thread_db_id);
}

export function saveMessage({ thread_db_id, role, content, content_type = 'text' }) {
  const result = getDb().prepare(`
    INSERT INTO messages (thread_id, role, content, content_type) VALUES (?, ?, ?, ?)
  `).run(thread_db_id, role, content, content_type);
  touchThread(thread_db_id);
  return result.lastInsertRowid;
}

export function getMessages(thread_db_id) {
  return getDb().prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion,
           mf.rating            AS fb_rating,
           mf.comment           AS fb_comment,
           mf.improved_text     AS fb_improved
    FROM messages m
    LEFT JOIN token_log tl        ON tl.message_id = m.id
    LEFT JOIN message_feedback mf ON mf.message_id = m.id
    WHERE m.thread_id = ? AND COALESCE(m.content_type, 'text') != 'task_image'
    ORDER BY m.created_at ASC LIMIT 100
  `).all(thread_db_id);
}

export function getMessagesAll(thread_db_id) {
  return getDb().prepare(`
    SELECT m.id, m.role, m.content, m.content_type, m.created_at,
           tl.prompt_tokens     AS cost_prompt,
           tl.completion_tokens AS cost_completion
    FROM messages m
    LEFT JOIN token_log tl ON tl.message_id = m.id
    WHERE m.thread_id = ?
    ORDER BY m.created_at ASC LIMIT 150
  `).all(thread_db_id);
}
```

---

## Neue Datei: stores/dashboard.js

```js
import { getDb } from '../db.js';

export function getStudents(activity_id) {
  return getDb().prepare(`
    SELECT t.id              AS thread_db_id,
           t.moodle_user_id,
           t.moodle_user_name,
           t.updated_at,
           COUNT(m.id)                             AS message_count,
           COALESCE(tl_agg.cost_prompt, 0)         AS cost_prompt,
           COALESCE(tl_agg.cost_completion, 0)     AS cost_completion
    FROM threads t
    LEFT JOIN messages m ON m.thread_id = t.id
    LEFT JOIN (
      SELECT thread_id,
             SUM(prompt_tokens)     AS cost_prompt,
             SUM(completion_tokens) AS cost_completion
      FROM token_log GROUP BY thread_id
    ) tl_agg ON tl_agg.thread_id = t.id
    WHERE t.activity_id = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(activity_id);
}
```

---

## Änderungen in db.js

Funktionen `saveThread`, `touchThread`, `findThread`, `updateThreadName`,
`saveMessage`, `getMessages`, `getMessagesAll`, `getStudents` aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `chat-session.js` | `import { saveThread, touchThread, findThread, updateThreadName, saveMessage, getMessages } from './stores/chat.js';` |
| `server.js` | `import { saveMessage, getMessages, getMessagesAll } from './stores/chat.js';` und `import { getStudents } from './stores/dashboard.js';` |
| `routes/dashboard.js` | `import { getMessages } from '../stores/chat.js';` und `import { getStudents } from '../stores/dashboard.js';` |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Chat-Widget öffnen → Nachricht senden → Antwort kommt → kein Fehler in Logs
3. Dashboard öffnen → Schülerliste erscheint → Chat-Detail eines Schülers öffnen → Nachrichten + Kosten sichtbar
