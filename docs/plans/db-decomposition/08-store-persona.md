# Schritt 08: stores/persona.js

Schüler-Personas für Simulation. Globale Personas (admin-verwaltet) und
Lehrer-Personas (teacherId-gebunden).

---

## Zu extrahierende Funktionen

```js
// Aus db.js → stores/persona.js
export function getGlobalPersonas() { ... }
export function getTeacherPersonas(userId) { ... }
export function getAllPersonasForUser(userId) { ... }
export function createPersona({ teacherId, teacherName, name, description, example_msgs, createdBy }) { ... }
export function deletePersona(id, userId, adminOverride) { ... }
export function promotePersonaToGlobal(id, adminId) { ... }
export function getAllTeacherPersonasGrouped() { ... }
export function getStudentMessages(activityId) { ... }   // Für Persona-Vorschlag
```

---

## Neue Datei: stores/persona.js

```js
import { getDb } from '../db.js';

export function getGlobalPersonas() {
  return getDb().prepare('SELECT * FROM personas WHERE teacher_id IS NULL ORDER BY name ASC').all();
}

export function getTeacherPersonas(userId) {
  return getDb().prepare('SELECT * FROM personas WHERE teacher_id = ? ORDER BY name ASC').all(userId);
}

export function getAllPersonasForUser(userId) {
  return getDb().prepare(`
    SELECT * FROM personas
    WHERE teacher_id IS NULL OR teacher_id = ?
    ORDER BY (teacher_id IS NULL) DESC, name ASC
  `).all(userId);
}

export function createPersona({ teacherId, teacherName, name, description, example_msgs, createdBy }) {
  const result = getDb().prepare(`
    INSERT INTO personas (teacher_id, teacher_name, name, description, example_msgs, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(teacherId || null, teacherName || null, name, description || null, example_msgs || null, createdBy || null);
  return result.lastInsertRowid;
}

export function deletePersona(id, userId, adminOverride = false) {
  if (adminOverride) {
    getDb().prepare('DELETE FROM personas WHERE id = ?').run(id);
  } else {
    getDb().prepare('DELETE FROM personas WHERE id = ? AND teacher_id = ?').run(id, userId);
  }
}

export function promotePersonaToGlobal(id, adminId) {
  getDb().prepare(
    'UPDATE personas SET teacher_id = NULL, teacher_name = NULL, created_by = ? WHERE id = ?'
  ).run(adminId, id);
}

export function getAllTeacherPersonasGrouped() {
  return getDb().prepare(`
    SELECT * FROM personas
    WHERE teacher_id IS NOT NULL
    ORDER BY COALESCE(teacher_name, teacher_id) ASC, name ASC
  `).all();
}

export function getStudentMessages(activityId) {
  return getDb().prepare(`
    SELECT m.content, t.moodle_user_name
    FROM messages m
    JOIN threads t ON t.id = m.thread_id
    WHERE t.activity_id = ? AND m.role = 'user'
      AND COALESCE(m.content_type, 'text') = 'text'
      AND length(m.content) > 10
    ORDER BY m.created_at DESC
    LIMIT 80
  `).all(activityId);
}
```

---

## Änderungen in db.js

Alle 8 Persona-Funktionen aus db.js entfernen.

---

## Aufrufer aktualisieren

| Datei | Neuer Import |
|-------|-------------|
| `routes/personas.js` | `import { getGlobalPersonas, getTeacherPersonas, createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped, getStudentMessages } from '../stores/persona.js';` |
| `routes/simulation.js` | `import { getAllPersonasForUser, getGlobalPersonas, getTeacherPersonas } from '../stores/persona.js';` |

**Hinweis:** `getAllPersonasForUser` ist im aktuellen `routes/personas.js` importiert aber nie aufgerufen (toter Import). Beim Umstellen weglassen — kein Re-Export nötig.

---

## Testen

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Persona anlegen (als Lehrer) → Persona löschen (als Lehrer) → verschwindet aus Liste → neue Persona anlegen → zur globalen Persona promoten (als Admin) → erscheint in globaler Liste
3. Personas-Vorschlag-Button drücken → KI-Vorschlag auf Basis echter Schülernachrichten erscheint
4. Simulation starten (beliebige Persona wählen, `/simulate`-Endpoint) → mind. 1 Äußerungs-/Antwort-Paar erscheint ohne Fehler
