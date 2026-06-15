# ADR 0010 — Quiz-Aktivität: Bot-Konfiguration bleibt quiz-weit, kein Per-Frage-Scoping

**Status:** Akzeptiert
**Datum:** 2026-06-15

---

## Kontext

Der Bot soll künftig auch in einzelne Quiz-Fragen (Fragetyp „Beschreibung"/Infotext) eingebettet werden können, nicht nur in normale Aktivitäten. Wunsch wäre eine Konfiguration pro Frage (inkl. Fragenversion), damit mehrere Bots in unterschiedlichen Fragen desselben Quiz unabhängig konfiguriert werden können.

DOM-Analyse von vier Seitenvarianten (Schüler-Versuch, Lehrer-Vorschau, Rollenwechsel-Vorschau, Fragenbank-Vorschau) zeigt: Eine über alle Kontexte hinweg stabile Frage-ID existiert nicht.

- **Fragenbank-Vorschau** (Konfigurations-Ort): liefert `questionid` + Version (`restartversion`) über die URL — aber ohne Bezug zur Slot-Position im eigentlichen Quiz.
- **Quiz-Versuch** (Live-Betrieb für Schüler): liefert nur `qubaid:slot`-Formularfelder. `qubaid` ist pro Versuch/Schüler unterschiedlich, `slot` ist quiz-weit stabil, aber im Konfigurations-Kontext nicht ermittelbar.

Eine Konfiguration "pro Frage inkl. Version" lässt sich damit nicht zuverlässig implementieren.

---

## Entscheidung

`activityId` (= `cmid`) bleibt die alleinige Konfigurationseinheit, auch für Quiz. Pro Quiz wird genau **ein** Bot unterstützt, unabhängig davon in welcher Frage er technisch eingebettet ist. `course_id` wird zusätzlich erfasst (Settings-Handshake) und dient als Gruppierungsebene für Monitoring/Logs.

---

## Considered Options

- **Per-Slot-Scoping** (`activityId` + `slot`): würde mehrere Bots pro Quiz erlauben. Verworfen, da `slot` im Konfigurations-Kontext (Fragenbank-Vorschau) nicht ermittelbar ist — Lehrkraft müsste ihn manuell eintragen, fehleranfällig.
- **Vorbereitetes, aber inaktives Schema** (`slot`-Spalte mit Default NULL): Aufwand für ein Szenario, das aktuell nicht erwartet wird (YAGNI). Kann bei Bedarf nachgerüstet werden, ohne bestehende Daten zu brechen (NULL = „gilt fürs ganze Quiz").

---

## Konsequenzen

- Lehrkräfte mit mehreren Bot-wünschen in einem Quiz müssen aktuell mehrere Quiz-Aktivitäten anlegen (ein Bot pro Quiz).
- `activities`-Tabelle bekommt eine neue Spalte `course_id`.
- CONTEXT.md, Abschnitt „Aktivität", dokumentiert diese Einschränkung.
