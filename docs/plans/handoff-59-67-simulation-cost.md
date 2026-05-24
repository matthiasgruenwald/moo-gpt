# Handoff: Simulation Cost Recording — Token akkumulieren

**Issue:** #67  
**Wave:** 2 (Backend-Integration)  
**Blocked by:** #60 (ai-client Breaking Change), #62 (CostService)

## Kontext

`simulation.js` führt pro Durchlauf 3 AI-Calls durch (Äußerung generieren, Antwort, Bewertung). Alle drei geben nach #60 `{text, usage}` zurück. Statt 3 Einträge in `token_log` → **ein einziger Eintrag** mit summierten Token (User-Story 7).

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `simulation.js` | 3 Calls Z. 6, 19, 27 — Token akkumulieren |
| Route, die `simulation.js` aufruft | `recordWerkzeugUsage` hier aufrufen + `cost` zurückgeben |
| `cost-service.js` | recordWerkzeugUsage (nach #62) |
| `test/prompt-check.test.js` | Testvorlage |

## Wichtige Constraints

- `call_type = 'simulation'`
- Akkumulation vor dem Recording: `totalPromptTokens = sum(usage.prompt_tokens)`, analog für completion
- `recordWerkzeugUsage` einmal am **Ende** des Durchlaufs aufrufen — nicht bei jedem Teil-Call
- Die Route, die `runSimulation` aufruft, muss `activityId` übergeben (Simulation ist immer aktivitätsbezogen)
- Simulation wird laut PRD „voraussichtlich bald entfernt" — trotzdem korrekt implementieren, aber keine aufwändige UI nötig

## Testansatz

Unit-Test mit gemocktem `aiClient`:
- 3 gemockte Calls mit bekannten Token-Zahlen
- Nach Durchlauf: genau ein `token_log`-Eintrag mit summierten Token

## Prozess-Hinweise

- `/karpathy-guidelines` aktivieren
- `/tdd` nutzen
- `simulation.js` vollständig lesen bevor du anfängst — komplexe Logik
- Ergebnisse als Kommentar auf Issue #67
