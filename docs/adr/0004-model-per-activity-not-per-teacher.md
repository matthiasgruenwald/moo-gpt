# ADR 0004 – Modell pro Aktivität statt pro Lehrer

**Status:** Akzeptiert  
**Datum:** 2026-05-27

## Kontext

Das GPT-Modell wurde bisher als Lehrer-weite Präferenz in `teacher_preferences.preferred_model` gespeichert. Es gab zwei unabhängige Stellen für das Modell: die Lehrer-Präferenz (höchste Priorität) und das globale System-Prompt-Modell (Admin). Das führte zu Konfusionen: Wer an einem Ort das Modell änderte, sah unerwartet ein anderes Modell in einer konkreten Aktivität.

## Entscheidung

Das Modell wird **pro Aktivität** gespeichert (neue Spalte `model` in `activities`, `teacher_templates`, `system_template`). Die Lehrer-weite Präferenz (`teacher_preferences.preferred_model`) entfällt vollständig.

Neue Auflösungsreihenfolge in `model-resolver.js`:  
`activities.model` → `prompts.model` (System-Prompt-Modell, Admin) → `MODEL_NAME`-Env

## Alternativen

- **Lehrer-Präferenz als Fallback behalten:** Hätte die Konfusion nur abgemildert, nicht beseitigt. Ein Ort pro Aktivität ist klarer.
- **Nur globales Modell (Admin steuert alles):** Zu wenig Flexibilität für Lehrkräfte mit unterschiedlichen Aktivitäten.

## Konsequenzen

- DB-Migration: neue Spalte `model` in `activities`, `teacher_templates`, `system_template`.
- `teacher_preferences.preferred_model` wird nicht mehr geschrieben oder gelesen (Spalte kann in einem späteren Cleanup entfernt werden).
- `model-resolver.js` erhält einen neuen `activityId`-Parameter und liest `activities.model` zuerst.
- `config.html` zeigt das Modell-Feld als Aktivitäts-Einstellung (nicht mehr als persönliche Präferenz).
