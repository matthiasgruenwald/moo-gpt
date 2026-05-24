# ADR 0001: Werkzeug-Kosten in token_log (nicht separate Tabelle)

**Status:** Akzeptiert  
**Datum:** 2026-05-24

## Kontext

Bisher werden nur Schüler-Chat-Kosten in `token_log` erfasst. Lehrer-Werkzeuge (Live-Zusammenfassung, Prompt-Assistent, Kriterien, Optimierung, Simulation, Persona) verursachen ebenfalls API-Kosten, die bisher unsichtbar sind. Es war zu entscheiden, ob diese Werkzeug-Kosten in derselben Tabelle oder einer eigenen Tabelle gespeichert werden.

## Entscheidung

Werkzeug-Kosten werden in `token_log` gespeichert — nicht in einer separaten Tabelle. Die bestehende Tabelle erhält eine neue Spalte `call_type TEXT`. Chat-Einträge behalten `call_type = NULL`. Werkzeug-Einträge erhalten einen expliziten Typ-String (`live-summary`, `prompt-assist`, `criteria`, `optimize`, `persona`, `simulation`).

## Begründung

- **Einfachheit:** Alle Kosten-Aggregationen (pro Aktivität, pro Lehrer, gesamt) bleiben einfache SQL-Queries auf einer Tabelle.
- **Kein JOIN-Overhead:** Chat-Kosten + Werkzeug-Kosten lassen sich ohne JOIN summieren.
- **SQLite-gerecht:** Die Datenbank ist klein und lokal. Separate Tabellen würden keinen Skalierungsvorteil bringen.
- **Rückwärtskompatibilität:** Bestehende Chat-Einträge müssen nicht migriert werden — `call_type = NULL` bleibt gültig.

## Alternativen verworfen

**Separate `werkzeug_log`-Tabelle:** Hätte NULL-freie Spalten ergeben, aber zwei Tabellen für jede Kosten-Abfrage (oder UNION). Unnötige Komplexität für den tatsächlichen Nutzen.

## Konsequenzen

- DB-Migration: `ALTER TABLE token_log ADD COLUMN call_type TEXT` (SQLite-safe, kein Default nötig).
- Alle bestehenden Queries, die Chat-only-Kosten berechnen, brauchen `WHERE call_type IS NULL`.
- `getActivityCostByModel` wird zu `getActivityCostByModel(activityId, callType?)` — optional filterbar.
