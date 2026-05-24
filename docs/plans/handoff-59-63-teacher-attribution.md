# Handoff: Teacher-Attribution beim ersten /dashboard/chats-Zugriff

**Issue:** #63  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #61 (DB-Schema braucht `teacher_id`/`teacher_name`)

## Kontext

Wenn eine Lehrkraft `/dashboard/chats?activityId=X` aufruft und `activities.teacher_id` für diese Aktivität noch `NULL` ist, wird sie als Eigentümer eingetragen. Danach nie wieder überschrieben. Ermöglicht Admin-seitige Kosten-Aufschlüsselung nach Lehrer (#68, #72).

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `routes/dashboard.js` | Hier den Attribution-Call einfügen (GET /dashboard/chats) |
| `docs/adr/0002-teacher-attribution-on-dashboard-access.md` | Architektur-Entscheidung + SQL-Pattern |
| `db.js` | DB-Zugang |
| `test/prompt-check.test.js` | Testvorlage |

## Wichtige Constraints

- `UPDATE ... WHERE activity_id = ? AND teacher_id IS NULL` — atomare Bedingung, kein separater SELECT+UPDATE nötig
- `teacher_id` und `teacher_name` aus der Auth-Session lesen (wie in anderen Dashboard-Routes bereits verwendet)
- Kein Fehler wenn `activityId` fehlt — still überspringen

## Testansatz

Integration-Test (wie bestehende Tests):
1. Request ohne vorherige Attribution → `teacher_id` wird gesetzt
2. Zweiter Request mit anderer Lehrkraft → `teacher_id` bleibt unverändert
3. Request ohne `activityId` → kein Fehler, kein Eintrag

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- Bestehende Auth-Pattern in `routes/dashboard.js` lesen, bevor du anfängst
- Ergebnisse als Kommentar auf Issue #63
