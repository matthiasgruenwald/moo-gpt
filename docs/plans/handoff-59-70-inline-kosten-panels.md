# Handoff: Inline-Kosten in Werkzeug-Panels

**Issue:** #70  
**Wave:** 3 (Frontend)  
**Blocked by:** #64 (Live-Summary gibt `cost`), #65 (Prompt-Assistent gibt `cost`), #68 (API-Endpunkte)

## Kontext

Nach jedem Werkzeug-Call wird das `cost`-Objekt aus der API-Antwort als dezente Zeile unter dem Ergebnis angezeigt. Zusätzlich eine laufende Session-Summe am Panel-Rand.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| Live-Summary-Panel JS/HTML | Kosten-Zeile nach Zusammenfassung einfügen |
| Prompt-Assistent-Panel JS/HTML | Kosten-Zeile nach jedem Schritt einfügen |
| `docs/dashboard.md` | Panel-Struktur und bestehende Kosten-Anzeigen |

**Achtung:** Konkrete Dateinamen per `ls public/` verifizieren. API-Antwort-Format aus Issues #64/#65-Kommentaren lesen (Agenten dokumentieren dort das tatsächliche Format).

## Wichtige Constraints

- `cost`-Objekt fehlt → Zeile entfällt komplett (kein Fehler, kein Platzhalter)
- Session-Summe: clientseitige Variable `sessionCost`, akkumuliert über alle Schritte der Panel-Sitzung
- Bei Panel-Reset (z.B. neue Aktivität): `sessionCost` auf 0 zurücksetzen
- Styling: dezent, kleiner als Ergebnis-Text — nicht dominant

## API-Antwort-Format

Aus Issue #64/#65 (nach Implementierung dort als Kommentar dokumentiert):
```json
{ "cost": { "promptTokens": 312, "completionTokens": 89, "costEur": 0.02 } }
```
Tatsächliches Format in den Issue-Kommentaren #64/#65 nachschlagen.

## Testansatz

Manueller Smoke-Test:
- Live-Summary abrufen → Kosten-Zeile erscheint, Session-Summe steigt
- Prompt-Assistent-Schritt → Kosten-Zeile nach Antwort, Session-Summe steigt
- Simulierter `null`-Cost in DevTools → keine UI-Fehler

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- Issue-Kommentare von #64 und #65 lesen, bevor du anfängst (API-Format)
- Erkenntnisse (Panel-JS-Struktur) als Kommentar auf Issue #70
