# ADR 0002: Lehrer-Zuordnung zu Aktivitäten beim Dashboard-Aufruf

**Status:** Akzeptiert  
**Datum:** 2026-05-24

## Kontext

Die `activities`-Tabelle hat keine `teacher_id`-Spalte. Für die Admin-Kosten-Übersicht (Gesamtkosten nach Lehrer aufgeschlüsselt) wird eine Zuordnung benötigt: welche Aktivität gehört welchem Lehrer.

## Entscheidung

`activities` erhält eine Spalte `teacher_id TEXT`. Sie wird gesetzt, wenn eine Lehrkraft das Dashboard für eine Aktivität öffnet (erster Zugriff auf `/dashboard/chats?activityId=X`). Danach bleibt die Zuordnung fix — auch wenn ein anderer Lehrer die Aktivität öffnet, wird sie nicht überschrieben.

## Begründung

- **Kein expliziter Setup-Schritt:** Lehrkräfte müssen keine Aktivität "anlegen" — die Attribution passiert durch natürliche Nutzung.
- **Moodle-Realität:** In Moodle gehört jede Aktivität zu einem Kurs, der von einem Lehrer verwaltet wird. Es ist unwahrscheinlich, dass zwei Lehrer dieselbe `activityId` im Dashboard öffnen.
- **Einfach:** Kein zusätzlicher Onboarding-Flow, kein Formular.

## Alternativen verworfen

**Beim ersten Werkzeug-Call setzen:** Spätere Attribution, einige Aktivitäten ohne Lehrkraft bis zum ersten Werkzeug-Einsatz.

**Manuelle Zuweisung im Admin-Panel:** Zu aufwändig, nicht skalierbar.

## Konsequenzen

- DB-Migration: `ALTER TABLE activities ADD COLUMN teacher_id TEXT` + `ADD COLUMN teacher_name TEXT` (für lesbaren Namen in der Admin-Übersicht).
- Bestehende Aktivitäten bleiben ohne `teacher_id` — Admin-Ansicht zeigt diese als „Unbekannt".
- `UPSERT`-Logik beim Dashboard-Aufruf: `UPDATE activities SET teacher_id = ?, teacher_name = ? WHERE activity_id = ? AND teacher_id IS NULL`.
