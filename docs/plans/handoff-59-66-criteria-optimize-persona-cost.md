# Handoff: Criteria + Optimize + Persona Cost Recording

**Issue:** #66  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #60 (ai-client Breaking Change), #62 (CostService)

## Kontext

Drei Module mit ähnlichem Muster — alle nutzen nach #60 `jsonCall` mit `{text, usage}`. Alle sollen Kosten erfassen und zurückgeben.

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `criteria.js` | jsonCall ~Z. 7 — call_type: `'criteria'` |
| `routes/criteria.js` | HTTP-Wrapper für criteria.js |
| `optimize.js` | jsonCall ~Z. 36 — call_type: `'optimize'` |
| `routes/erfahrungsprompt.js` | HTTP-Wrapper für optimize.js |
| `routes/personas.js` | jsonCall ~Z. 41 — call_type: `'persona'` |
| `cost-service.js` | recordWerkzeugUsage importieren (nach #62) |
| `test/prompt-check.test.js` | Testvorlage |

## Wichtige Constraints

- `activityId` wird in den Routes (nicht in den Logik-Modulen) verwaltet — Recording in der Route, nicht im Logik-Modul
- Ausnahme prüfen: `personas.js` kann auch ohne `activityId` aufgerufen werden (globale Persona-Generierung) — kein Recording in diesem Fall (User-Story 9)
- Alle drei API-Antworten erhalten `cost`-Objekt

## Testansatz

Je ein Integration-Test pro Endpoint:
- Mit `activityId` → DB-Eintrag + `cost` in Antwort
- Persona ohne `activityId` → kein DB-Eintrag, kein Fehler

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen
- Die 3 Module sind unabhängig — parallel oder nacheinander implementierbar
- Ergebnisse als Kommentar auf Issue #66
