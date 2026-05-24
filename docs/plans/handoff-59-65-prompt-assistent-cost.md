# Handoff: Prompt-Assistent Cost Recording

**Issue:** #65  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #60 (ai-client Breaking Change), #62 (CostService)

## Kontext

`routes/activity.js` enthält den Prompt-Assistenten mit zwei AI-Calls (nach #60 beide `{text/json, usage}`):
- ~Z. 67: `jsonCall` (Rückfrage-Modus oder Direktmodus)
- ~Z. 128: `textCall` (Prompt-Generierung)

Beide Calls sollen Kosten erfassen und in der API-Antwort zurückgeben.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `routes/activity.js` | Beide Endpoints anpassen |
| `cost-service.js` | recordWerkzeugUsage importieren (nach #62) |
| `env-config.js` | MODEL_NAME — welches Modell verwendet wird |
| `test/prompt-check.test.js` | Testvorlage |
| `docs/server.md` | Endpoint-Beschreibung für Kontext |

## Wichtige Constraints

- `call_type = 'prompt-assist'` für beide Calls
- Jeder Schritt ist ein eigener `token_log`-Eintrag (nicht akkumulieren — das ist nur bei Simulation so)
- API-Antworten erhalten jeweils ein `cost`-Objekt zusätzlich
- Frontend (Issue #70) erwartet das `cost`-Feld in der Antwort

## Testansatz

Integration-Test für beide Endpoints:
- Rückfrage-Endpoint: Antwort enthält `cost`, DB hat Eintrag mit `call_type = 'prompt-assist'`
- Generierungs-Endpoint: analog

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen
- Grep nach `activity.js`-Imports in anderen Dateien — sicherstellen dass API-Format-Änderung nichts bricht
- Ergebnisse als Kommentar auf Issue #65
