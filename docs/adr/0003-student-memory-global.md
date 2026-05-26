# ADR 0003 — Schüler-Memory ist global, nicht aktivitätsspezifisch

**Status:** Accepted  
**Datum:** 2026-05-26  
**Issue:** #24 (TTS-Ausgabe, Stimmwahl-Persistenz)

---

## Kontext

`student_memory` war bisher mit `UNIQUE(student_id, activity_id)` angelegt — jeder Schüler hatte pro Aktivität einen eigenen Memory-Eintrag. Das war die ursprüngliche Annahme: unterschiedliche Fächer, unterschiedliche Präferenzen.

Im Zuge von #24 (Stimmwahl geräteübergreifend persistent) wurde klar, dass Stimmwahl in `student_memory` mitgespeichert werden soll. Stimmwahl ist aktivitätsübergreifend — ein Schüler will dieselbe Stimme in Mathe, Chemie und Deutsch. Ein aktivitätsgebundenes Schema passt dazu nicht.

Außerdem gilt: auch der freie Präferenz-Text (`preference_text`) ist bei näherer Betrachtung aktivitätsübergreifend gedacht. „Ich bevorzuge kurze Antworten" gilt für alle Aktivitäten dieses Schülers, nicht nur für eine.

## Entscheidung

`student_memory` wird auf **globale Speicherung** umgestellt:

- `activity_id`-Spalte entfällt
- `UNIQUE`-Constraint nur noch auf `student_id` (= PRIMARY KEY)
- Neue Spalte `preferred_voice TEXT NOT NULL DEFAULT 'nova'`

Schema nach Migration:
```sql
CREATE TABLE student_memory (
  student_id      TEXT PRIMARY KEY,
  preference_text TEXT NOT NULL DEFAULT '',
  preferred_voice TEXT NOT NULL DEFAULT 'nova',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Da zum Zeitpunkt der Umstellung nur Testdaten existieren, entfällt eine Datenmigration. Die bestehende Tabelle wird verworfen und neu angelegt.

API-Änderung: `/api/student-memory` ohne `:activityId`. Der Endpunkt gibt und setzt den globalen Eintrag des Schülers.

## Verworfene Alternativen

**Per-Aktivität mit separater globaler Präferenztabelle:** Eine neue `student_preferences`-Tabelle (nur für Stimmwahl) hätte die Memory-Semantik unangetastet gelassen — aber das per-Aktivität-Modell für Memory wäre dann trotzdem falsch gewesen und hätte zu einem späteren Bruch geführt.

**Hybrid (globaler Basistext + aktivitätsspezifische Ergänzung):** Mächtig, aber unnötige Komplexität für den aktuellen Bedarf. Kann nachgerüstet werden wenn konkreter Bedarf entsteht.

## Konsequenzen

- `stores/student-memory.js`: alle Funktionen verlieren den `activityId`-Parameter
- `routes/student-memory.js`: Endpunkt-Pfad ohne `:activityId`
- `prompt-builder.js`: `getStudentMemory(studentId)` statt `getStudentMemory(studentId, activityId)`
- Dashboard-Route für Memory-Anzeige muss angepasst werden (zeigt jetzt globalen Eintrag)
- Widget: Memory-Overlay und Voice-Selector teilen sich dieselbe Speicher- und Lade-Logik
