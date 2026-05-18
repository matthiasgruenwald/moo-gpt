# Schritt 06: stores/feedback.js

Nachrichten-Feedback durch Lehrkräfte (Daumen hoch/runter, Kommentar, Verbesserungsvorschlag).

---

## Zu extrahierende Funktionen

```js
// Aus db.js → stores/feedback.js
export function saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy }) { ... }
export function getFeedbackByActivity(activityId) { ... }
```

---

## Neue Datei: stores/feedback.js

```js
import { getDb } from '../db.js';

export function saveFeedback({ messageId, threadId, activityId, rating, comment, improvedText, ratedBy }) {
  getDb().prepare(`
    INSERT INTO message_feedback (message_id, thread_id, activity_id, rating, comment, improved_text, rated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      rating        = excluded.rating,
      comment       = excluded.comment,
      improved_text = excluded.improved_text,
      rated_by      = excluded.rated_by
  `).run(messageId, threadId, activityId || null, rating, comment || null, improvedText || null, ratedBy || null);
}

export function getFeedbackByActivity(activityId) {
  return getDb().prepare(`
    SELECT f.*, m.content AS message_content, m.created_at AS message_created_at,
           t.moodle_user_name, t.moodle_user_id
    FROM message_feedback f
    JOIN messages m ON m.id = f.message_id
    JOIN threads  t ON t.id = f.thread_id
    WHERE f.activity_id = ?
    ORDER BY f.created_at DESC
  `).all(activityId);
}
```

---

## Änderungen in db.js

Funktionen `saveFeedback`, `getFeedbackByActivity` aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `routes/criteria.js` | `import { saveFeedback, getFeedbackByActivity } from '../stores/feedback.js';` |
| `optimize.js` | `import { getFeedbackByActivity } from './stores/feedback.js';` |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Im Dashboard eine Schüler-Antwort mit Daumen hoch/runter bewerten → Feedback erscheint gespeichert
3. Optimize-Prompt-Button drücken → läuft durch (nutzt Feedback intern)
