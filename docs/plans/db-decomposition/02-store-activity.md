# Schritt 02: stores/activity.js

Aktivitätskonfiguration. Drei Funktionen, klarer Scope (activities-Tabelle).

---

## Zu extrahierende Funktionen

```js
// Aus db.js → stores/activity.js
export function upsertActivity(activity_id, activity_name, opener, upload_mode, title, botIcon) { ... }
export function getActivity(activity_id) { ... }
export function setActivityConfig(activity_id, opener, uploadMode, title, botIcon) { ... }
```

---

## Neue Datei: stores/activity.js

```js
import { getDb } from '../db.js';

export function upsertActivity(activity_id, activity_name, opener, upload_mode, title, botIcon) {
  if (!activity_id || !activity_name) return;
  getDb().prepare(`
    INSERT INTO activities (activity_id, activity_name, opener, upload_mode, title, bot_icon, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      activity_name = excluded.activity_name,
      opener        = COALESCE(excluded.opener, activities.opener),
      upload_mode   = COALESCE(excluded.upload_mode, activities.upload_mode, 'off'),
      title         = COALESCE(excluded.title, activities.title),
      bot_icon      = COALESCE(excluded.bot_icon, activities.bot_icon, 'grw'),
      updated_at    = CURRENT_TIMESTAMP
  `).run(activity_id, activity_name, opener ?? null, upload_mode ?? null, title ?? null, botIcon ?? null);
}

export function getActivity(activity_id) {
  return getDb().prepare(
    'SELECT activity_name, opener, upload_mode, title, bot_icon FROM activities WHERE activity_id = ?'
  ).get(activity_id) || null;
}

export function setActivityConfig(activity_id, opener, uploadMode, title, botIcon) {
  getDb().prepare(`
    INSERT INTO activities (activity_id, opener, upload_mode, title, bot_icon, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      opener      = COALESCE(excluded.opener, activities.opener),
      upload_mode = COALESCE(excluded.upload_mode, activities.upload_mode),
      title       = COALESCE(excluded.title, activities.title),
      bot_icon    = COALESCE(excluded.bot_icon, activities.bot_icon),
      updated_at  = CURRENT_TIMESTAMP
  `).run(activity_id, opener ?? null, uploadMode ?? null, title ?? null, botIcon ?? null);
}
```

---

## Änderungen in db.js

Funktionen `upsertActivity`, `getActivity`, `setActivityConfig` aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `routes/activity.js` | `import { getActivity, setActivityConfig } from '../stores/activity.js';` |
| `routes/dashboard.js` | `import { getActivity } from '../stores/activity.js';` |
| `chat-session.js` | `import { upsertActivity, getActivity } from './stores/activity.js';` |
| `server.js` | `import { getActivity } from './stores/activity.js';` |

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Chat-Widget öffnen → Logs zeigen activity_name korrekt gesetzt
3. GET /api/activity-config → antwortet mit opener/uploadMode/title
