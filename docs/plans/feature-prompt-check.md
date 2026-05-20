# PRD: Prompt-Check für Lehrkräfte

## Problem

Lehrkräfte konfigurieren das Chat-Widget (Titel, Begrüßung, Hinweise/Prompt) in den Moodle-Aktivitätseinstellungen — ohne Feedback, ob der Prompt gut zu ihrer Aufgabenstellung passt. Aktueller Workaround: Lehrkraft kopiert Aufgabe und Prompt manuell in ChatGPT, lässt sich einen besseren Prompt vorschlagen.

Weiteres Problem: Bilder in der Aufgabenstellung (z.B. GeoGebra-Export als TIFF) werden bisher nicht beim Erstellen validiert — Fehler tauchen erst auf, wenn Schüler mit dem Chat interagieren.

---

## Ziel

Die Lehrkraft kann direkt in der Aktivitätskonfiguration:

1. Den aktuellen Prompt gegen die Aufgabenstellung prüfen lassen
2. Einen verbesserten Vorschlag bekommen (mit Begründung der Schwächen)
3. Den alten oder neuen Prompt auswählen
4. Bilder in der Aufgabenstellung sofort validieren

---

## Workflow (Soll)

```
Lehrkraft öffnet Aktivitätseinstellungen
  → füllt Felder aus (Titel, Begrüßung, Hinweise/Prompt, Upload-Modus)
  → klickt "Prompt prüfen / verbessern"
      → KI analysiert Aufgabenstellung + aktuellen Prompt
      → zeigt Ergebnis: Schwächen des aktuellen Prompts + neuer Vorschlag nebeneinander
  → Lehrkraft wählt: alten behalten / neuen übernehmen / manuell anpassen
  → "Speichern und schließen" wird grün / aktiv
```

---

## UI-Konzept

### Formular (Aktivitätseinstellungen)

Bestehende Felder bleiben. Neuer Button prominent platziert:

```
[ Titel        ] [___________________]
[ Begrüßung    ] [___________________]
[ Hinweise     ] [___________________]  ← das ist der Prompt
[ Upload-Modus ] [off / images / files]

        [ 🔍 Prompt prüfen & verbessern ]   ← primärer CTA, Mitte

[ Speichern und schließen ]                 ← sekundär, wird grün nach Prüfung
```

**Alternativer Ansatz** (weniger Reibung): Button direkt neben "Speichern und schließen" — hebt "Prompt prüfen" hervor, weil es oben steht.

### Ergebnis-Panel (erscheint nach KI-Antwort)

```
┌─────────────────────────────────────────────────────────┐
│  AKTUELLER PROMPT          │  VORSCHLAG                 │
│  ────────────────          │  ────────────              │
│  [Aktueller Text]          │  [Neuer Vorschlag]         │
│                            │                            │
│  Schwächen:                │                            │
│  • Kein Verweis auf Jg.    │                            │
│  • Zu allgemein, kein Fach │                            │
│  • Keine Sprachvorgabe     │                            │
│                            │                            │
│  [Aktuellen behalten]      │  [Vorschlag übernehmen]   │
└─────────────────────────────────────────────────────────┘
```

Hinweise (Schwächen) erscheinen **nur im Panel**, nicht im Prompt selbst.

---

## KI-Anfrage (Prompt-Check-Endpoint)

**Input:**
- `task`: vollständige Aufgabenstellung (HTML, inkl. Bilder als data-URL)
- `currentHints`: aktueller Prompt/Hinweise-Text
- `taskImages`: extrahierte Bilder aus der Aufgabenstellung (für Kontext)

**Output (JSON):**
```json
{
  "weaknesses": ["Schwäche 1", "Schwäche 2"],
  "suggestion": "Verbesserter Prompt-Text"
}
```

**Systemanweisung an KI:** Du erhältst eine Aufgabenstellung und einen Prompt für einen Lernassistenten. Analysiere den Prompt: Welche Schwächen hat er in Bezug auf die Aufgabe? Erstelle dann einen verbesserten Prompt. Antworte ausschließlich als JSON mit den Feldern `weaknesses` (Array, max. 5 Punkte) und `suggestion` (String, der neue Prompt).

---

## Bild-Validierung beim Speichern

Gleichzeitig mit dem Prompt-Check: Alle Bilder in der Aufgabenstellung werden geprüft. Falls ein Bild nicht verarbeitet werden kann (TIFF, ungültiges Format):

- Fehlermeldung im Panel: "⚠️ 1 Bild konnte nicht gelesen werden. Bitte als PNG exportieren."
- Speichern trotzdem möglich, aber Warnung bleibt sichtbar

---

## Backend-Endpoint

```
POST /api/activity/:activityId/prompt-check
Auth: requireTeacherAuth
Body: { task: string, currentHints: string }
Response: { weaknesses: string[], suggestion: string }
```

Nutzt `GEN_MODEL` (Generierungsmodell, nicht Chat-Modell).

---

## Implementierungs-Schritte

1. **Backend**: `/api/activity/:activityId/prompt-check` Endpoint in `routes/activity.js`
2. **Frontend (Aktivitätsseite)**: Button + Panel in die Aktivitätseinstellungs-UI (Dashboard-Seite oder separates Modal)
3. **Bildvalidierung**: Beim Klick auf "Prompt prüfen" gleichzeitig Bilder aus der Aufgabenstellung extrahieren und validieren
4. **State**: Speichern-Button Farbe ändert sich nach erfolgreichem Check (grau → grün)

---

## Offene Fragen

- Soll der Button in der Moodle-Aktivität selbst erscheinen (TinyMCE-Snippet) oder im Dashboard? → Dashboard ist wahrscheinlicher (hat Auth-Kontext)
- Soll der Vorschlag direkt in das Hinweise-Feld geschrieben werden können, oder nur angezeigt?
- Prompt-Check als Pflicht oder optional? → Optional, aber visuell prominent

---

## Priorisierung

**Bald** — der Prompt ist die wichtigste Steuervariable für die Unterrichtsqualität. Lehrkräfte konfigurieren ihn aktuell ohne Feedback, mit hoher Fehlerquote (zu generisch, falsches Fach, falsche Sprache).
