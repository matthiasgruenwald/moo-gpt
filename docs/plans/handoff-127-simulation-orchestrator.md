# Handoff #127 — Simulations-Orchestrierung aus Route extrahieren

**GitHub Issue:** #127  
**Label:** ready-for-agent  
**Blocked by:** — (unabhängig)  
**Letzter relevanter Commit:** nach #126 (Widget-Config Seam)  
**Ziel:** `simulation.js` als tiefer Orchestrator, Route als dünner HTTP-Adapter (~50 Zeilen), `persona-selector.js` aufgelöst.

---

## Einstieg für neue Session

```
/karpathy-guidelines
/tdd
```

---

## Ist-Zustand (verifiziert 2026-05-27)

### `routes/simulation.js` (171 Zeilen, 2 Route-Handler)

**`POST /simulate`** (~70 Zeilen):
1. Persona aus DB laden + validieren
2. Kriterien und Erfahrungsprompt laden
3. SSE-Headers setzen
4. `runSimulation()` aufrufen
5. `recordWerkzeugUsage()` aufrufen
6. `generateOptimizeProposal()` aufrufen
7. Events senden (`start`, `progress`, `pair`, `suggestion`, `done`, `error`)

**`POST /one-click-optimize`** (~85 Zeilen):
1. Kriterien augmentieren (`augmentCriteria`)
2. `selectPersonasForOneClick()` aufrufen
3. Alle Personas parallel simulieren (`Promise.allSettled`)
4. `simResultsText` aus `allPairs` zusammensetzen
5. `generateOptimizeProposal()` aufrufen
6. Events senden (`criteria`, `personas`, `sim_start`, `sim_pair`, `optimize_done`, `error`)

Der Route-Handler kennt die Persona-Auswahl-Heuristik, die Simulations-Orchestrierung UND das Event-Protokoll — drei verschiedene Concerns.

### `persona-selector.js` (51 Zeilen):
- Einzige Export-Funktion: `selectPersonasForOneClick(userId, count=4)`
- Heuristik: Eigene Personas (`selectDiverse`) → Fallback-Namen aus `getGlobalPersonas()` → Rest Global
- Nur von `routes/simulation.js:6` importiert

### `simulation.js` (91 Zeilen):
- Exportiert `runSimulation({ persona, config, erfahrungsprompt, criteria, models, aiClient, onPair })`
- Generiert Äußerungen (jsonCall), ruft KI auf (textCall), evaluiert (jsonCall) — pro Persona ein Run
- Gibt `{ pairs, simResultsText, totalUsage }` zurück — `simResultsText` wird aktuell nur von Route verwendet

### Existierende Tests:
- `test/simulation-cost.test.js` — 5 Tests für `runSimulation` Token-Akkumulation + `recordWerkzeugUsage`
- **Kein** Test für `selectPersonasForOneClick` oder `runOneClickOptimization`

---

## Zielzustand

### `simulation.js` (Orchestrator) — neue Exports neben `runSimulation`:

```js
// Persona-Auswahl (war in persona-selector.js) — private selectDiverse bleibt intern
export function selectPersonasForOneClick(userId, count = 4)

// Orchestriert komplette One-Click-Optimierung ohne HTTP-Kenntnisse
// onProgress: Callback { type, ...data } — Route mapped das 1:1 auf sendEvent
export async function runOneClickOptimization({
  activityId, userId, config, erfahrungsprompt, aiClient, onProgress
})
```

`runOneClickOptimization` kapselt:
- Kriterien augmentieren → `onProgress('criteria', ...)`
- Personas auswählen → `onProgress('personas', ...)`
- `Promise.allSettled` über alle Personas (parallel simulieren)
- `onProgress('sim_start', ...)` + `onProgress('sim_pair', ...)` per Pair
- `recordWerkzeugUsage` pro Persona-Run
- `simResultsText` zusammensetzen
- `generateOptimizeProposal()` aufrufen → `onProgress('optimize_done', ...)`
- Fehlerfall: wirf Error (Route fängt und sendet `error`-Event)

### `routes/simulation.js` danach (~50 Zeilen, 2 Handler):

**`POST /simulate`**: Input validieren → `runSimulation()` → SSE-Events senden. Keine Geschäftslogik.

**`POST /one-click-optimize`**: SSE-Headers → `runOneClickOptimization({ ..., onProgress: sendEvent })`. Keine Geschäftslogik.

### `persona-selector.js`:
**Datei wird gelöscht.** Logik lebt in `simulation.js`.

---

## Implementierungsplan (TDD)

### Schritt 1 — Baseline

```bash
DB_PATH=:memory: node --test test/simulation-cost.test.js
```

→ 5 Tests, alle grün.

### Schritt 2 — Tests first (RED)

Neue Datei `test/simulation-orchestrator.test.js`:

```js
// Run: DB_PATH=:memory: node --test test/simulation-orchestrator.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
```

Mindest-Tests:
- **Test A** — `selectPersonasForOneClick` bevorzugt eigene Personas (mockiere `getTeacherPersonas`, `getGlobalPersonas`)
- **Test B** — `selectPersonasForOneClick` füllt mit globalen Personas auf wenn eigene < count
- **Test C** — `runOneClickOptimization` ruft `onProgress` mit `criteria`, `personas`, `sim_pair`, `optimize_done` auf (gemockter `aiClient`)
- **Test D** — `runOneClickOptimization` wirft Error wenn alle Simulationen fehlschlagen

### Schritt 3 — `selectPersonasForOneClick` einbauen (GREEN für A+B)

`selectDiverse` + `selectPersonasForOneClick` aus `persona-selector.js` nach `simulation.js` kopieren (private Helper + Export).

### Schritt 4 — `runOneClickOptimization` implementieren (GREEN für C+D)

One-Click-Logik aus `routes/simulation.js` (`POST /one-click-optimize`, Zeilen 99–168) nach `simulation.js` extrahieren. `sendEvent`-Calls → `onProgress`-Callbacks. `recordWerkzeugUsage` bleibt in `simulation.js` (sinnvolle Abhängigkeit auf `cost-service.js`).

### Schritt 5 — Route-Handler dünn machen

`routes/simulation.js`:
- Import `selectPersonasForOneClick` entfernen
- Import `persona-selector.js` entfernen
- `augmentCriteria`, `saveErkenntnisse`, `getErkenntnisse`, `getFeedbackByActivity` aus Route entfernen (in `runOneClickOptimization`)
- `POST /one-click-optimize`-Handler auf ~10 Zeilen reduzieren

### Schritt 6 — `persona-selector.js` löschen

```bash
rm /opt/moo-gpt/persona-selector.js
```

### Schritt 7 — Alle Tests grün

```bash
DB_PATH=:memory: node --test test/simulation-cost.test.js test/simulation-orchestrator.test.js
npm test
```

---

## Wichtige Gotchas

- **Testrunner ist `node --test`**, nicht vitest (kein `npx vitest` — das Projekt kennt kein vitest).
- Der `onPair`-Callback in `runSimulation` sendet weiterhin SSE-Events aus der Route. Das ist OK — Route übergibt Callback, `runSimulation` ruft ihn auf. Nicht anfassen.
- `runOneClickOptimization` importiert `recordWerkzeugUsage` aus `cost-service.js` — das ist eine saubere Abhängigkeit (Orchestrator trägt Kosten selbst ein).
- `getCriteria`, `getErkenntnisse`, `saveErkenntnisse`, `getFeedbackByActivity` zieht `runOneClickOptimization` selbst → nur `activityId` als Parameter nötig.
- `getCachedConfig()` wird in `runOneClickOptimization` aufgerufen (wie in der Route heute) — kein extra Parameter.
- `simResultsText` für One-Click hat ein anderes Format als für Single-Simulate (`[PersonaName]` Prefix) — beide Formate beibehalten.

---

## Tests ausführen

```bash
cd /opt/moo-gpt
DB_PATH=:memory: node --test test/simulation-cost.test.js
DB_PATH=:memory: node --test test/simulation-orchestrator.test.js
npm test
```

---

## Manuelle Tests (Matthias)

- [ ] Simulation mit einer Persona manuell starten → Bewertung wird gespeichert und angezeigt
- [ ] One-Click-Optimierung auslösen → SSE-Stream läuft durch, Erfahrungsprompt-Vorschlag erscheint am Ende

Nach erfolgreichen manuellen Tests Issue #127 schließen.
