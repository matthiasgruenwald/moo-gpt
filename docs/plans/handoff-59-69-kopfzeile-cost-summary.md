# Handoff: Kopfzeile Cost-Summary auf /dashboard/chats

**Issue:** #69  
**Wave:** 3 (Frontend)  
**Blocked by:** #68 (Cost-API-Endpunkte)

## Kontext

Auf `/dashboard/chats?activityId=X` wird nach Aktivitätswahl `GET /api/activity/:activityId/cost-summary` geladen und als kompakte Zeile angezeigt. Silent-Fail wenn Daten fehlen.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `public/dashboard/chats.html` (oder äquivalent) | Wo die Kopfzeile gerendert wird |
| `public/dashboard/chats.js` (oder äquivalent) | Fetch-Logik + Render |
| `docs/dashboard.md` | Dashboard-Layout, bestehende Kosten-Anzeigen als Stilvorlage |

**Achtung:** Konkrete Dateinamen vor dem Start per `ls public/` und `ls public/dashboard/` verifizieren — die Struktur kann von der Doku abweichen.

## Wichtige Constraints

- Fetch bei Aktivitätswechsel (nicht nur beim Seitenload)
- `null`-Werte in der API-Antwort → Kopfzeile komplett ausblenden (kein Platzhalter, kein Fehler-Toast)
- Styling: analog zu bestehenden Kosten-Anzeigen im Dashboard (kleine Schrift, dezent)
- Format: „Chat-Kosten X,XX € · Werkzeug-Kosten Y,YY € · Gesamt Z,ZZ €"

## Testansatz

Manueller Smoke-Test nach Implementierung:
- Aktivität mit Schüler-Chats wählen → Kopfzeile erscheint
- Aktivität wechseln → Werte aktualisieren sich
- Kein Console-Fehler wenn API `null` zurückgibt

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- Bestehende Kosten-Anzeige-Pattern im Dashboard-JS lesen vor dem Start
- Erkenntnisse (z.B. welche JS-Datei das Dashboard-Rendering macht) als Kommentar auf Issue #69
