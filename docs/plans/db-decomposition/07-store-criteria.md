# Schritt 07: stores/criteria.js

Kriterien und Erkenntnisse. Beide liegen in der `erkenntnisse`-Tabelle, unterschieden
durch `source = 'criteria'` vs. andere Quellen. Gehören fachlich zusammen.

---

## Zu extrahierende Funktionen

```js
// Erkenntnisse (source != 'criteria')
export function getErkenntnisse(activityId) { ... }
export function saveErkenntnisse(activityId, content, source) { ... }

// Kriterien (source = 'criteria', mit Soft-Delete)
export function getCriteria(activityId) { ... }
export function getDeletedCriteria(activityId) { ... }
export function softDeleteCriterion(id) { ... }
export function restoreCriterion(id) { ... }
```

---

## Neue Datei: stores/criteria.js

```js
import { getDb } from '../db.js';

export function getErkenntnisse(activityId) {
  return getDb().prepare(`
    SELECT id, activity_id, content, source, created_at
    FROM erkenntnisse
    WHERE activity_id = ? OR activity_id IS NULL
    ORDER BY created_at DESC LIMIT 50
  `).all(activityId || '');
}

export function saveErkenntnisse(activityId, content, source) {
  getDb().prepare(`
    INSERT INTO erkenntnisse (activity_id, content, source) VALUES (?, ?, ?)
  `).run(activityId || null, content, source || 'ai');
}

export function getCriteria(activityId) {
  return getDb().prepare(`
    SELECT * FROM erkenntnisse
    WHERE source = 'criteria' AND COALESCE(status, 'active') = 'active'
      AND (activity_id = ? OR activity_id IS NULL)
    ORDER BY created_at ASC
  `).all(activityId);
}

export function getDeletedCriteria(activityId) {
  return getDb().prepare(`
    SELECT * FROM erkenntnisse
    WHERE source = 'criteria' AND status = 'deleted'
      AND (activity_id = ? OR activity_id IS NULL)
    ORDER BY created_at ASC
  `).all(activityId);
}

export function softDeleteCriterion(id) {
  getDb().prepare(
    `UPDATE erkenntnisse SET status = 'deleted' WHERE id = ? AND source = 'criteria'`
  ).run(id);
}

export function restoreCriterion(id) {
  getDb().prepare(
    `UPDATE erkenntnisse SET status = 'active' WHERE id = ? AND source = 'criteria'`
  ).run(id);
}
```

---

## Änderungen in db.js

Alle 6 Criteria-Funktionen aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `routes/criteria.js` | `import { getCriteria, getDeletedCriteria, softDeleteCriterion, restoreCriterion, saveErkenntnisse } from '../stores/criteria.js';` |
| `routes/simulation.js` | siehe unten — split import |
| `optimize.js` | `import { getErkenntnisse } from './stores/criteria.js';` |

### routes/simulation.js — Endzustand nach Schritt 07

`getCriteria` und `saveErkenntnisse` wandern nach `stores/criteria.js`. Die Personas-Funktionen bleiben bis Schritt 08 in `db.js`:

```js
// Personas bleiben in db.js bis Schritt 08
import { getAllPersonasForUser, getGlobalPersonas, getTeacherPersonas } from '../db.js';
// Criteria-Funktionen jetzt aus dem Store
import { getCriteria, saveErkenntnisse } from '../stores/criteria.js';
```

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Im Dashboard ein Kriterium anlegen → löschen → wiederherstellen → Status korrekt (testet `getCriteria`, `getDeletedCriteria`, `softDeleteCriterion`, `restoreCriterion`, `saveErkenntnisse`)
3. Erfahrungsprompt-Optimierung anstoßen → Vorschlag erscheint (testet `getErkenntnisse` via `optimize.js`)
4. Simulation starten → neue Kriterien werden gespeichert (testet `saveErkenntnisse` via `simulation.js`)
