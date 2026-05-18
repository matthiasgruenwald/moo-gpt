# Schritt 01: stores/admin.js

Kleinste Domäne. Vier Funktionen, klar abgegrenzt. Validiert das Store-Pattern.

---

## Zu extrahierende Funktionen

```js
// Aus db.js → stores/admin.js
export function isAdmin(userId) { ... }
export function addAdmin(userId, grantedBy) { ... }
export function removeAdmin(userId) { ... }
export function getAdmins() { ... }
```

---

## Neue Datei: stores/admin.js

```js
import { getDb } from '../db.js';

export function isAdmin(userId) {
  if (!userId) return false;
  return !!getDb().prepare('SELECT 1 FROM admin_users WHERE moodle_user_id = ?').get(userId);
}

export function addAdmin(userId, grantedBy = null) {
  getDb().prepare(`
    INSERT OR IGNORE INTO admin_users (moodle_user_id, granted_by) VALUES (?, ?)
  `).run(userId, grantedBy);
}

export function removeAdmin(userId) {
  getDb().prepare('DELETE FROM admin_users WHERE moodle_user_id = ?').run(userId);
}

export function getAdmins() {
  return getDb().prepare('SELECT * FROM admin_users ORDER BY granted_at ASC').all();
}
```

---

## Änderungen in db.js

1. `getDb()` hinzufügen (export, wird von allen Stores genutzt):
   ```js
   export function getDb() { return db; }
   ```

2. Die 4 Admin-Funktionen aus db.js entfernen.

---

## Aufrufer aktualisieren

### auth-middleware.js

```diff
-import { isAdmin } from './db.js';
+import { isAdmin } from './stores/admin.js';
```

### routes/admin.js

Bestehenden Import aus `../db.js` aufteilen — 4 Admin-Funktionen entfernen, neue Zeile davor:

```diff
+import { isAdmin, addAdmin, removeAdmin, getAdmins } from '../stores/admin.js';
 import {
-  isAdmin, addAdmin, removeAdmin, getAdmins,
   saveSystemPrompt, getPromptHistory, deletePromptHistoryEntry,
   getSystemTemplate, setSystemTemplate,
   getTeacherPreference,
 } from '../db.js';
```

### server.js

`addAdmin` aus dem bestehenden `./db.js`-Import entfernen, neue Zeile hinzufügen:

```diff
+import { addAdmin } from './stores/admin.js';
 import {
   initDb,
   getActiveSystemPrompt, saveSystemPrompt,
-  addAdmin,
   getStudents, getActivity,
   ...
 } from './db.js';
```

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Admin-Dashboard öffnen → Admin-Liste erscheint (GET /api/admin/admins)
3. Admin hinzufügen oder entfernen → Änderung sofort sichtbar
