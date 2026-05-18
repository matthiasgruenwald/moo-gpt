# db.js Decomposition – Strategie

`db.js` hat 53 Exports aus 9 fachlichen Domänen in einer flachen Liste.
Ziel: fachlich gruppierte Store-Module unter `stores/`, `db.js` wird reiner
Initialisierungs-Hub.

---

## Kernentscheidungen

### 1. Shared DB-Handle: `getDb()`

`better-sqlite3` erfordert ein einzelnes synchrones `db`-Objekt.
Alle Stores teilen sich denselben Handle via einer internen Getter-Funktion.

```js
// db.js (intern, nicht exportiert)
let _db;
export function initDb() { _db = new Database(DB_PATH); ... }
export function getDb() { return _db; }
```

Jeder Store importiert `getDb` aus `db.js`:

```js
// stores/admin.js
import { getDb } from '../db.js';
export function isAdmin(userId) {
  return !!getDb().prepare('SELECT 1 FROM admin_users WHERE moodle_user_id = ?').get(userId);
}
```

### 2. Domain-Zuordnung: Fachliches Ziel, nicht Schreibrecht

**Leitlinie:** Store-Zugehörigkeit = wofür ist die Funktion da (was wird verwaltet?),
nicht wer Schreibrecht hat.

Beispiel: `getSystemTemplate` / `setSystemTemplate` → `stores/teacher.js`, weil sie
Lehrer-Templates verwalten — auch wenn nur Admins schreiben dürfen.

### 3. Caller-Imports direkt umstellen

Alle Aufrufer (`routes/*`, `server.js`, `token-log.js`, …) importieren nach der Migration
direkt aus dem jeweiligen Store. Keine Re-Exports in `db.js`.

```js
// vorher (alle Dateien)
import { isAdmin, addAdmin } from './db.js';     // oder '../db.js'

// nachher (pro Caller, im jeweiligen Schritt)
import { isAdmin, addAdmin } from './stores/admin.js';   // oder '../stores/admin.js'
```

Caller-Update erfolgt **im selben Schritt** wie die Store-Extraktion — nicht in einem
separaten Schritt 10. So ist nach jedem Schritt ein konsistenter, testbarer Zustand.

### 4. Reihenfolge: Kleinste/sicherste Domänen zuerst

Jeder Schritt: Store anlegen + alle Caller aktualisieren + Funktionen aus db.js entfernen.

| Schritt | Store | Funktionen | Caller-Updates |
|---------|-------|-----------|----------------|
| 01 ✅ | `stores/admin.js` | 4 | auth-middleware.js, routes/admin.js, server.js |
| 02 ✅ | `stores/activity.js` | 3 | routes/activity.js, routes/dashboard.js, chat-session.js, server.js |
| 03 ✅ | `stores/token.js` | 3 | token-log.js |
| 04 ✅ | `stores/prompt.js` | 8 | routes/admin.js, routes/erfahrungsprompt.js, routes/activity.js, routes/simulation.js, server.js, criteria.js, optimize.js, chat-session.js |
| 05 ✅ | `stores/teacher.js` | 10 | routes/teacher.js, routes/admin.js, routes/activity.js, server.js, chat-session.js |
| 06 ✅ | `stores/feedback.js` | 2 | routes/criteria.js, optimize.js |
| 07 ✅ | `stores/criteria.js` | 6 | routes/criteria.js, routes/simulation.js, optimize.js |
| 08 | `stores/persona.js` | 8 | routes/personas.js, routes/simulation.js |
| 09 | `stores/chat.js` + `stores/dashboard.js` | 7 + 1 | server.js, chat-session.js, routes/dashboard.js |
| 10 | `db.js` cleanup | — | nur initDb + getDb, alle Funktionen entfernt |

**Hinweis Schritt 09:** `stores/dashboard.js` enthält `getStudents` (cross-domain Join
über threads + messages + token_log). Es wird im selben Schritt angelegt wie `stores/chat.js`,
weil `routes/dashboard.js` dort ohnehin angefasst wird (vertical slice).

**Hinweis Schritt 08:** `getStudentMessages` (Persona-Vorschlag-Endpoint) gehört in
`stores/persona.js` — es wird für Personas genutzt, auch wenn es Chat-Tabellen liest.

### 5. Was in db.js bleibt

- `initDb()` (Schema-Erstellung + Migrationen)
- `getDb()` (interner Handle für Stores)
- Keine Re-Exports mehr — alle Caller importieren direkt aus den Stores

---

## Testen pro Schritt

Jedes Schritt-Dokument enthält einen „Testen"-Abschnitt mit:

```
## Testen
1. systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager → kein Importfehler
2. [konkrete UI-Aktion für diesen Store]
3. [ggf. zweite Aktion]
```

Funktionstest nach Schritt 10: vollständiger Smoke-Test (Chat, Dashboard, Simulation).
