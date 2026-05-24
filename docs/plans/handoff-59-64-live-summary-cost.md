# Handoff: Live-Summary Cost Recording

**Issue:** #64  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #60 (ai-client Breaking Change), #62 (CostService)

## Kontext

Der Live-Summary-Endpoint in `routes/dashboard.js` ruft `aiClient.textCall()` auf. Nach #60 gibt dieser `{text, usage}` zurück. Dieser Slice nutzt `usage`, um den Werkzeug-Aufruf in `token_log` zu erfassen und die Kosten in der API-Antwort zurückzugeben.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `routes/dashboard.js` | Endpoint ~Z. 102: textCall → usage → recordWerkzeugUsage |
| `cost-service.js` | Neu (nach #62): recordWerkzeugUsage importieren |
| `env-config.js` | GEN_MODEL — Modell-Konstante für diesen Call |
| `test/prompt-check.test.js` | Testvorlage: aiClient per DI, bypassAuth-Option |

## Wichtige Constraints

- `call_type = 'live-summary'`
- Nur wenn `activityId` vorhanden (User-Story 9) — ohne `activityId` kein Recording, kein Fehler
- API-Antwort ändert sich: `summary` (String) → `{ summary, cost: { promptTokens, completionTokens, costEur } }`
- Frontend (Issue #70) erwartet dieses neue Format

## Testansatz

Integration-Test:
- Request mit `activityId` → `token_log` hat neuen Eintrag, Antwort enthält `cost`
- Request ohne `activityId` → kein `token_log`-Eintrag, Antwort enthält trotzdem `summary` (kein Fehler)

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen
- API-Antwort-Änderung in Issue-Kommentar dokumentieren (Frontend braucht es für #70)
- Ergebnisse als Kommentar auf Issue #64
