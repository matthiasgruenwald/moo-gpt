# Handoff: DB-Migration — token_log.call_type + activities.teacher_id/teacher_name

**Issue:** #61  
**Wave:** 1 (Foundation)  
**Blocked by:** –

## Kontext

Zwei SQLite-Migrationen vorbereiten, die von Wave 2 und 3 gebraucht werden. Die Architektur-Entscheidungen sind bereits dokumentiert.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `db.js` | Migrations-Logik gehört hierher (Server-Start) |
| `token-log.js` | Bestehende Queries auf `token_log` — betroffen durch `call_type` |
| `docs/adr/0001-werkzeug-kosten-in-token-log.md` | Architektur-Entscheidung für `token_log.call_type` |
| `docs/adr/0002-teacher-attribution-on-dashboard-access.md` | Architektur-Entscheidung für `activities.teacher_id` |
| `docs/db.md` | Schema-Übersicht, Migration-Konventionen |
| `docs/gotchas.md` | Bekannte SQLite-Stolpersteine |

## Wichtige Constraints

- SQLite: `ALTER TABLE ADD COLUMN` ist idempotent-sicher nur mit Existenzprüfung (`PRAGMA table_info`)
- Bestehende `token_log`-Queries, die Chat-Kosten berechnen, müssen `WHERE call_type IS NULL` erhalten
- **Keine Datenmigration** — bestehende Zeilen bleiben mit `NULL` in neuen Spalten
- Migration beim Server-Start ausführen, nicht als separates Script

## Testansatz

- Prüfen: Migration läuft zweimal ohne Fehler (Idempotenz)
- Prüfen: Bestehende Queries liefern dieselben Ergebnisse wie vor der Migration
- Prüfen: neuer Eintrag mit `call_type = 'test'` wird korrekt gespeichert und abgefragt

## Prozess-Hinweise

- `/karpathy-guidelines` vor dem Start aktivieren
- Grep auf `token_log` in `db.js` und `token-log.js` vor dem Start
- Ergebnisse am Ende als Kommentar auf Issue #61 dokumentieren
