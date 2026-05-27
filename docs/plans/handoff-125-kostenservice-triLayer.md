# Handoff #125 — KostenService-Tri-Layer konsolidieren

**GitHub Issue:** #125  
**Label:** ready-for-agent  
**Blocked by:** #124 ✅ abgeschlossen (commit `e33c0ce`)  
**Ziel:** `cost-service.js` als einziger Entry Point für alle Kosten-Abfragen. `token-log.js` protokolliert nur noch Chat-Sessions.

---

## Einstieg für neue Session

```
/karpathy-guidelines
/tdd
```

---

## Voraussetzung: Issue #124 abgeschlossen ✅

`pricing.js` existiert (commit `e33c0ce`) und exportiert:
- `computeTokenCost(promptTokens, completionTokens, model)` → `{inputEur, outputEur, totalEur}|null`
- `computeAudioCost(audioSeconds)` → `number|null`
- `computeTtsCost(ttsCharacters)` → `number|null`
- `getCachedEurRate()`, `getCachedPricing(model)` — Sync-Zugriff für legacy
- `_setEurRateForTest()`, `_setPricingCacheForTest()` — Test-Helfer

`token-log.js` hat keine eigenen Fetcher/Caches mehr (110 Zeilen).

---

## Aktueller Ist-Zustand

### `token-log.js` exportiert jetzt:

| Export | Verbleib nach #125 |
|--------|-------------------|
| `sumCostRows(rows)` | → nach `cost-service.js` |
| `computeRunCost(promptTokens, completionTokens, model)` | → nach `cost-service.js` |
| `computeThreadCost(threadDbId)` | → nach `cost-service.js` |
| `computeActivityCost(actId)` | → nach `cost-service.js` |
| `enrichMessagesWithCost(messages)` | bleibt (Chat-Concern) |
| `recordUsage(...)` | bleibt (Chat-Concern) |
| `computeAudioCost`, `computeTtsCost` | Re-Exporte von `pricing.js`, **entfernen** wenn keine direkten Callers mehr |

### Callers die aktuell von `token-log.js` importieren (Prod-Code):

```
cost-service.js:11       import { sumCostRows } from './token-log.js'
routes/dashboard.js:6    import { enrichMessagesWithCost, computeThreadCost, sumCostRows } from '../token-log.js'
routes/activity.js:11    import { sumCostRows } from '../token-log.js'
services/chat-response.js:18  import { recordUsage as _recordUsage } from '../token-log.js'
routes/dashboard-ws.js:27     import { enrichMessagesWithCost, computeThreadCost } from '../token-log.js'
```

Nach dem Refactoring sollen nur noch `enrichMessagesWithCost` und `recordUsage` von `token-log.js` importiert werden.

---

## Zielzustand

### `token-log.js` — nur noch:
- `recordUsage` (Chat-Session-Protokollierung)
- `enrichMessagesWithCost` (reichert Chat-Nachrichten an — ruft intern `computeTokenCost` aus `pricing.js`)

### `cost-service.js` — zusätzlich:
- `sumCostRows` (übernommen)
- `computeRunCost` (übernommen, sync-Wrapper)
- `computeThreadCost` (übernommen)
- `computeActivityCost` (übernommen)

### Routes — angepasste Imports:
- `routes/dashboard.js`: `computeThreadCost`, `sumCostRows` von `cost-service.js`
- `routes/dashboard-ws.js`: `computeThreadCost` von `cost-service.js`
- `routes/activity.js`: `sumCostRows` von `cost-service.js`
- `cost-service.js` intern: `sumCostRows` ist jetzt lokal, kein Import mehr nötig

---

## Implementierungsplan (TDD)

### Schritt 1 — Baseline

```bash
DB_PATH=:memory: node --test test/cost-service.test.js test/audio-cost.test.js
```

Bekannte pre-existierende Failures in `cost-service.test.js`: `getWerkzeugLog`-Tests (fehlende `await` im Test, nicht in der Implementierung). Diese nicht anfassen.

### Schritt 2 — Tests für neue cost-service.js-Exports schreiben

In `test/cost-service.test.js` Tests für die migrierten Funktionen ergänzen:
- `sumCostRows` (bestehende Tests in `audio-cost.test.js` importieren von `token-log.js` → nach Migration von `cost-service.js`)
- `computeThreadCost` mit DB-In-Memory
- `computeActivityCost` mit DB-In-Memory

### Schritt 3 — Funktionen verschieben

1. In `cost-service.js` einfügen: `sumCostRows`, `computeRunCost`, `computeThreadCost`, `computeActivityCost`
2. Imports in `cost-service.js` erweitern (braucht `getThreadCostByModel`, `getActivityCostByModel` aus `stores/token.js` + `getCachedEurRate`, `getCachedPricing` aus `pricing.js`)
3. In `token-log.js` die vier Funktionen entfernen

### Schritt 4 — Callers aktualisieren

| Datei | Alter Import | Neuer Import |
|-------|-------------|-------------|
| `routes/dashboard.js` | `computeThreadCost, sumCostRows` von `token-log.js` | von `cost-service.js` |
| `routes/dashboard-ws.js` | `computeThreadCost` von `token-log.js` | von `cost-service.js` |
| `routes/activity.js` | `sumCostRows` von `token-log.js` | von `cost-service.js` |
| `cost-service.js` | `sumCostRows` von `token-log.js` | intern (kein Import nötig) |

### Schritt 5 — Alle Tests grün

```bash
DB_PATH=:memory: node --test test/cost-service.test.js test/audio-cost.test.js test/pricing.test.js
```

---

## Wichtige Gotchas

- `enrichMessagesWithCost` ruft **nicht** mehr `computeRunCostForModel` auf (das war vor #124 eine private Funktion). Nach #124 ruft es direkt `computeTokenCost` aus `pricing.js`. Diese Funktion bleibt in `token-log.js`.
- `computeRunCost` (sync) nutzt `getCachedEurRate()` und `getCachedPricing()` aus `pricing.js` — diese Abhängigkeit bleibt bestehen wenn die Funktion nach `cost-service.js` wandert.
- `audio-cost.test.js` importiert `sumCostRows` und `computeAudioCost` von `../token-log.js`. Nach der Migration muss entweder der Test-Import angepasst werden oder `sumCostRows` bleibt als Re-Export in `token-log.js` (empfehle: Test-Import anpassen).
- Testrunner ist `node --test`, **nicht** vitest.
- Pre-existierende Failures in `cost-service.test.js` (`getWerkzeugLog`-Tests ohne `await`) nicht anfassen.

---

## Tests ausführen

```bash
cd /opt/moo-gpt
DB_PATH=:memory: node --test test/cost-service.test.js
DB_PATH=:memory: node --test test/audio-cost.test.js
DB_PATH=:memory: node --test test/pricing.test.js
```

---

## Manuelle Tests (Matthias)

- [ ] `/dashboard/costs?activityId=X` → vollständige Kostentabelle sichtbar
- [ ] Admin-Kostenübersicht → alle Lehrer mit korrekten Kosten
- [ ] Prompt-Assistent → Kosten erscheinen in der Detailliste

Nach erfolgreichen manuellen Tests Issue #125 schließen.
