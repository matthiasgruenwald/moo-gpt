# Handoff: ai-client.js Breaking Change — {text, usage}

**Issue:** #60  
**Wave:** 1 (Foundation)  
**Blocked by:** –

## Kontext

`ai-client.js` exportiert `textCall` und `jsonCall`. Beide geben aktuell nur den Antwort-Text zurück — Usage-Daten (Token-Zahlen) werden verworfen. Wave 2 braucht `usage`, um Werkzeug-Kosten zu erfassen. Dieser Slice macht den Breaking Change und adaptiert alle Aufrufer.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `ai-client.js` | Breaking Change hier |
| `routes/dashboard.js` | Aufrufer (Live-Summary, ~Z. 102) |
| `routes/activity.js` | Aufrufer (Prompt-Assistent, ~Z. 67 + 128) |
| `routes/personas.js` | Aufrufer (Persona-Generierung, ~Z. 41) |
| `criteria.js` | Aufrufer (Kriterien, ~Z. 7) |
| `optimize.js` | Aufrufer (Optimierung, ~Z. 36) |
| `simulation.js` | Aufrufer (Simulation, Z. 6 + 19 + 27) |
| `test/prompt-check.test.js` | Testvorlage (node:test, DI-Pattern) |

## Wichtige Constraints

- `stream()` bleibt unverändert — nicht anfassen
- `jsonCall` wraps `textCall` intern: beide müssen konsistent `{text, usage}` zurückgeben. `text` ist bei `jsonCall` das geparste JSON-Objekt.
- Alle Aufrufer adaptieren heißt: `.text` destructurieren, nicht mehr den Rückgabewert direkt als String verwenden
- In diesem Slice werden noch **keine Kosten erfasst** — nur die Signatur ändern und Aufrufer anpassen

## Testansatz

- Alle bestehenden Tests müssen weiterhin bestehen (kein Regression)
- Unit-Test: `textCall` gibt `{text: string, usage: object}` zurück (aiClient per DI mockbar)
- Grep nach `textCall` und `jsonCall` vor dem Start, um alle Aufrufer zu finden

## Prozess-Hinweise

- `/karpathy-guidelines` vor dem Start aktivieren
- `/tdd` nutzen: Test für neue Signatur schreiben, dann Impl., dann Aufrufer
- Ergebnisse / Erkenntnisse am Ende in einem Kommentar auf Issue #60 dokumentieren
