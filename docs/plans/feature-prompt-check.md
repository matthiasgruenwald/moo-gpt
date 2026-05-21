# PRD: Prompt-Check für Lehrkräfte

## Problem

Lehrkräfte konfigurieren das Chat-Widget (Titel, Begrüßung, Aufgabenprompt, Upload-Modus) in den Aktivitätseinstellungen (`config.html`) — ohne Feedback, ob der Aufgabenprompt gut zur Aufgabenstellung passt. Aktueller Workaround: Lehrkraft kopiert Aufgabe und Prompt manuell in ChatGPT, lässt sich einen besseren Prompt vorschlagen.

Weiteres Problem: Bilder in der Aufgabenstellung (z.B. GeoGebra-Export als TIFF) werden bisher nicht beim Erstellen validiert — Fehler tauchen erst auf, wenn Schüler mit dem Chat interagieren.

---

## Ziel

Die Lehrkraft kann direkt in den Aktivitätseinstellungen:

1. Den aktuellen Aufgabenprompt gegen die Aufgabenstellung prüfen lassen
2. Einen verbesserten Vorschlag bekommen — als Word-Level-Diff mit Schwächen-Liste
3. Den Vorschlag direkt ins Aufgabenprompt-Feld übernehmen (oder verwerfen)
4. Bilder in der Aufgabenstellung sofort validieren

---

## Terminologie

| Begriff | Bedeutung |
|---------|-----------|
| Aufgabenprompt | Aktivitätsspezifischer Prompt (früher: „hints" + „Erfahrungsprompt" zusammengeführt). Im Code noch als `erfahrungsprompt` benannt, kanonisch heißt es jetzt Aufgabenprompt. |
| Aufgabenstellung | HTML-Inhalt der Moodle-Aktivität (`.activity-description`), wird clientseitig gelesen. |

---

## Workflow (Soll)

```
Lehrkraft öffnet Aktivitätseinstellungen (config.html)
  → füllt Felder aus (Titel, Begrüßung, Aufgabenprompt, Upload-Modus)
  → klickt "Prompt prüfen & verbessern"
      → KI analysiert Aufgabenstellung + aktuellen Aufgabenprompt
      → zeigt Word-Level-Diff (aktuell vs. Vorschlag) + Schwächen-Liste
  → Lehrkraft wählt: Vorschlag übernehmen (→ schreibt in Aufgabenprompt-Feld)
    oder verwerfen (→ Panel schließt, Feld unverändert)
  → "Speichern & Schließen" wird grün — Signal: Prompt wurde geprüft
```

---

## UI-Konzept

### Formular (Aktivitätseinstellungen)

Bestehende Felder bleiben. Neuer Button prominent platziert:

```
[ Bot-Titel    ] [___________________]
[ Begrüßung   ] [___________________]
[ Aufgabenpr. ] [___________________]  ← cfg-hints
[ Upload-Modus] [off / images / files]

        [ 🔍 Prompt prüfen & verbessern ]   ← primärer CTA

[ Speichern & Schließen ]   ← wird grün (#28a745) nach erfolgreichem Check
```

Prüfen ist optional — "Speichern & Schließen" ist immer klickbar.

### Ergebnis-Panel (erscheint nach KI-Antwort)

Word-Level-Diff, single-column (passt auf Tablet):

```
┌────────────────────────────────────────────────────────────┐
│  DIFF: Aktuell → Vorschlag                                 │
│  ────────────────────────                                  │
│  Du bist ein Assistent für ~~Schüler~~ [Schüler der 9B]   │
│  in Fach ~~Mathe~~ [Mathematik (Geometrie)].               │
│                                                            │
│  Schwächen:                                                │
│  • Jahrgang und Klasse fehlen                              │
│  • Thema zu allgemein                                      │
│  • Keine Sprachvorgabe                                     │
│                                                            │
│  [Verwerfen]          [Vorschlag übernehmen →]             │
└────────────────────────────────────────────────────────────┘
```

- Gelöscht: durchgestrichen, rot hinterlegt
- Neu: grün hinterlegt
- Diff wird clientseitig aus `suggestion` vs. aktuellem Aufgabenprompt berechnet
- Schwächen erscheinen als Gesamt-Liste unterhalb des Diffs
- "Vorschlag übernehmen" schreibt in `cfg-hints` und schließt das Panel; Lehrkraft kann den Text noch manuell anpassen

---

## KI-Anfrage (Prompt-Check-Endpoint)

**Input:**
- `task`: Aufgabenstellungs-HTML (via postMessage von `moo-bot.js` an `config.html` übergeben)
- `currentHints`: aktueller Aufgabenprompt
- `taskImages`: extrahierte Bilder aus der Aufgabenstellung (base64, ebenfalls via postMessage)

**Output (JSON):**
```json
{
  "weaknesses": ["Schwäche 1", "Schwäche 2"],
  "suggestion": "Verbesserter Prompt-Text"
}
```

**Systemanweisung an KI:** Du erhältst eine Aufgabenstellung und einen Prompt für einen Lernassistenten. Analysiere den Prompt: Welche Schwächen hat er in Bezug auf die Aufgabe? Erstelle dann einen verbesserten Prompt. Antworte ausschließlich als JSON mit den Feldern `weaknesses` (Array, max. 5 Punkte) und `suggestion` (String, der neue Prompt).

---

## Bild-Validierung

Gleichzeitig mit dem Prompt-Check: Alle Bilder aus der Aufgabenstellung (`taskImages`) werden geprüft. Falls ein Bild nicht verarbeitet werden kann (TIFF, ungültiges Format):

- Hinweis im Panel: "⚠️ 1 Bild konnte nicht gelesen werden. Bitte als PNG exportieren."
- Speichern trotzdem möglich, Warnung bleibt sichtbar

---

## Datenfluss: Aufgabenstellung → config.html

Die Aufgabenstellung ist nicht in der DB gespeichert — sie wird clientseitig aus dem Moodle-DOM gelesen (`.activity-description`). `config.html` läuft als iframe und hat keinen direkten DOM-Zugriff.

**Lösung:** `moo-bot.js` übergibt beim Öffnen des Config-Overlays die Daten via `postMessage`:
```js
iframe.contentWindow.postMessage(
  { type: 'moogpt:taskContext', task, images },
  '*'
)
```
`config.html` hält `task` und `images` lokal im Speicher und schickt sie beim Prompt-Check-Request mit. Kein DB-Schreiben nötig.

---

## Backend-Endpoint

```
POST /api/activity/:activityId/prompt-check
Auth: requireDashboardAuth
Body: { task: string, currentHints: string, taskImages?: string[] }
Response: { weaknesses: string[], suggestion: string }
```

Nutzt `GEN_MODEL` (Generierungsmodell, nicht Chat-Modell).

---

## Versionierung

Wenn die Lehrkraft den Vorschlag übernimmt und speichert, erzeugt das einen neuen Versions-Eintrag in der Aufgabenprompt-Historie (gleicher Mechanismus wie bei Änderungen über das Dashboard).

---

## Implementierungs-Schritte

1. **postMessage-Übergabe** in `moo-bot.js`: beim Öffnen des Config-Overlays `{ task, images }` an iframe senden
2. **config.html/config.js**: postMessage empfangen, lokal halten
3. **Backend**: `POST /api/activity/:activityId/prompt-check` in `routes/activity.js`, `requireDashboardAuth`
4. **Frontend**: Button + Panel mit Word-Level-Diff + Schwächen-Liste
5. **Vorschlag übernehmen**: schreibt in `cfg-hints`, schließt Panel
6. **Save-Button-Farbe**: nach erfolgreichem Check `background: #28a745`
7. **Bildvalidierung**: parallel zum KI-Aufruf, Warnung im Panel falls Bilder fehlen

---

## Priorisierung

**Bald** — der Aufgabenprompt ist die wichtigste Steuervariable für die Unterrichtsqualität. Lehrkräfte konfigurieren ihn aktuell ohne Feedback, mit hoher Fehlerquote (zu generisch, falsches Fach, falsche Sprache).
