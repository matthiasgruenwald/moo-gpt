# Schritt 06: stores/feedback.js ✅

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

### `routes/criteria.js`

Der db.js-Import muss aufgespalten werden — `getCriteria` usw. bleiben bis Schritt 07 in db.js:

```js
// vorher (eine Zeile)
import {
  getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion,
  saveErkenntnisse, saveFeedback, getFeedbackByActivity,
} from '../db.js';

// nachher (zwei Zeilen)
import {
  getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion,
  saveErkenntnisse,
} from '../db.js';
import { saveFeedback, getFeedbackByActivity } from '../stores/feedback.js';
```

### `optimize.js`

Auch hier Split — `getErkenntnisse` bleibt bis Schritt 07 in db.js:

```js
// vorher (eine Zeile)
import { getFeedbackByActivity, getErkenntnisse } from './db.js';

// nachher (zwei Zeilen)
import { getErkenntnisse } from './db.js';
import { getFeedbackByActivity } from './stores/feedback.js';
```

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Im Dashboard eine Schüler-Antwort mit Daumen hoch/runter bewerten → kein 4xx/5xx im Netzwerk-Tab, Daumen-Icon bleibt aktiv nach Reload
3. Optimize-Prompt-Button drücken → Request läuft durch ohne 500, Vorschlag erscheint im UI
